using FluentValidation;
using Vault.Application.Abstractions;
using Vault.Application.Archives;
using Vault.Application.Collections.Dtos;
using Vault.Application.Common;
using Vault.Application.Resources;
using Vault.Domain.Entities;

namespace Vault.Application.Collections;

public class CollectionService(
    ICollectionRepository collections,
    IImageRepository images,
    IStoreListingRepository storeListings,
    ICurrentTenant currentTenant,
    TimeProvider timeProvider,
    IValidator<CollectionDto> collectionValidator,
    IValidator<CreateCollectionRequest> createValidator,
    IValidator<ItemDto> itemValidator)
{
    public async Task<List<CollectionDto>> ListAsync(CancellationToken ct)
    {
        var all = await collections.ListAsync(ct);
        return [.. all.Select(c => c.ToDto())];
    }

    /// <summary>
    /// Every collection, each with the version a write of it must quote back.
    /// </summary>
    /// <remarks>
    /// This is the client's synchronisation point — it loads the whole vault
    /// once and edits from what it holds — so it is also the only honest place
    /// to hand out versions. A token fetched at any other moment would describe
    /// a document the payload being sent was not derived from, which is a
    /// precondition that passes exactly when it should fail.
    /// </remarks>
    public async Task<List<VersionedCollectionDto>> ListVersionedAsync(CancellationToken ct)
    {
        var all = await collections.ListAsync(ct);
        return [.. all.Select(Versioned)];
    }

    /// <summary>One collection, tenant-filtered. Missing reads as not found.</summary>
    public async Task<CollectionDto> GetAsync(string id, CancellationToken ct)
    {
        var collection = await collections.GetAsync(id, ct)
            ?? throw new NotFoundException(Messages.CollectionNotFoundFor(id));
        return collection.ToDto();
    }

    public async Task<VersionedCollectionDto> CreateAsync(CreateCollectionRequest request, CancellationToken ct)
    {
        await createValidator.ValidateAndThrowAsync(request, ct);
        var collection = new Collection
        {
            TenantId = currentTenant.TenantId,
            Id = $"c{Guid.NewGuid():N}"[..16],
            Name = request.Name,
            Description = request.Description,
            LinkShare = true,
            CreatedAtUtc = timeProvider.GetUtcNow(),
        };
        collections.Add(collection);
        await collections.SaveChangesAsync(ct);
        return Versioned(collection);
    }

    /// <summary>Full-document replace, mirroring the frontend contract.</summary>
    /// <param name="id">The collection to replace.</param>
    /// <param name="dto">The whole document, as the client last read it plus its edits.</param>
    /// <param name="ifMatch">
    /// The entity-tags the caller's <c>If-Match</c> offered. Never empty — a
    /// request with no precondition is refused before it reaches here.
    /// </param>
    /// <param name="ct">Cancellation.</param>
    /// <remarks>
    /// <para>
    /// Guarded twice, because the two guards catch different things. The
    /// comparison below catches the ordinary case — a tab left open while
    /// somebody else saved — and refuses <em>before</em> anything is written or
    /// any image mark is cleared. It cannot catch two writers who both read the
    /// same version within the same instant; that is what the concurrency token
    /// on the row does, inside the UPDATE itself, and the two together are what
    /// make "exactly one of them wins" true rather than likely.
    /// </para>
    /// <para>
    /// This replace deletes every group, section, item and member the payload does not
    /// carry, which is the whole reason the precondition is mandatory: an
    /// unguarded PUT from a stale tab is not a partial overwrite, it is a
    /// restore to an old document.
    /// </para>
    /// </remarks>
    public async Task<VersionedCollectionDto> UpdateAsync(
        string id,
        CollectionDto dto,
        IReadOnlyCollection<string> ifMatch,
        CancellationToken ct)
    {
        await collectionValidator.ValidateAndThrowAsync(dto, ct);
        var tracked = await collections.GetAsync(id, ct)
            ?? throw new NotFoundException(Messages.CollectionNotFoundFor(id));

        if (!CollectionVersions.Matches(tracked.Version, ifMatch))
        {
            throw new PreconditionFailedException(Messages.CollectionChangedElsewhere);
        }

        var tenantId = currentTenant.TenantId;
        var now = timeProvider.GetUtcNow();
        var replacement = new Collection
        {
            TenantId = tenantId,
            Id = id,
            Name = dto.Name,
            Description = dto.Description,
            LinkShare = dto.LinkShare,
            BannerImageId = dto.BannerImageId,
            IconImageId = dto.IconImageId,
            Currency = dto.Currency,
            Fields = [.. dto.Fields.Select(DtoMapper.ToEntity)],
            Groups = [.. dto.Groups.Select((g, i) => g.ToEntity(id, tenantId, i))],
            // Array order is the order they are shown in, exactly like items:
            // a section's position is editorial, not alphabetical.
            Sections = [.. dto.Sections.Select((sec, i) => sec.ToEntity(id, tenantId, i))],
            Items = [.. dto.Items.Select((it, i) => it.ToEntity(id, tenantId, i, now))],
            Members = [.. dto.Members.Select(m => m.ToEntity(id, tenantId))],
        };

        collections.ReplaceGraph(tracked, replacement);
        await collections.SaveChangesAsync(ct);

        var saved = await collections.GetAsync(id, ct)
            ?? throw new NotFoundException(Messages.CollectionNotFoundFor(id));

        var savedDto = saved.ToDto();
        // Read back from storage, not from the request: the point is to record
        // what the vault now points at, and the same traversal the export and
        // the import use answers that.
        //
        // Strictly downstream of both version checks, and that ordering is
        // load-bearing rather than incidental: a refused PUT must leave every
        // image mark exactly as it was. Clearing one for a write that did not
        // happen would restart the garbage collector's clock on a photo nothing
        // points at, hiding it for another whole grace period. The precondition
        // throws above and a lost race throws out of SaveChangesAsync, so
        // neither can reach this line.
        await ReleaseCollectedImagesAsync(CollectionImages.ReferencedBy(savedDto), ct);
        return new VersionedCollectionDto(CollectionVersions.ToETag(saved.Version), savedDto);
    }

    /// <summary>
    /// Tells the image garbage collector that these ids are in use again.
    /// </summary>
    /// <remarks>
    /// The sweep only learns what it looks at, so a reference that appears and
    /// disappears between two sweeps would leave an image running on a clock
    /// started before it was ever used. Doing it here is the safe direction and
    /// only that: clearing a mark can spare an image, never destroy one, so a
    /// failure to reach this line costs nothing but the stronger guarantee.
    /// </remarks>
    private Task ReleaseCollectedImagesAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        ids.Count == 0
            ? Task.CompletedTask
            : images.ClearUnreferencedMarkForCurrentTenantAsync(ids, ct);

    /// <summary>Deletes a collection. The precondition is optional here.</summary>
    /// <param name="id">The collection to delete.</param>
    /// <param name="ifMatch">
    /// The entity-tags the caller offered, or null if it offered none.
    /// </param>
    /// <param name="ct">Cancellation.</param>
    /// <remarks>
    /// <para>
    /// Not demanded: "delete this collection" is intent about a resource's
    /// identity, not a document derived from a read, so there is nothing in it a
    /// stale caller could overwrite without knowing. Refusing a deliberate,
    /// confirmed destructive act because an unrelated item moved would cost a
    /// reload and buy nothing.
    /// </para>
    /// <para>
    /// Honoured when it <em>is</em> offered, because a caller that sends one has
    /// said something about the state it expects and RFC 9110 requires that to
    /// be evaluated. Dropping it would make a cautious client indistinguishable
    /// from a careless one.
    /// </para>
    /// </remarks>
    public async Task DeleteAsync(string id, IReadOnlyCollection<string>? ifMatch, CancellationToken ct)
    {
        var collection = await collections.GetAsync(id, ct)
            ?? throw new NotFoundException(Messages.CollectionNotFoundFor(id));

        if (ifMatch is not null && !CollectionVersions.Matches(collection.Version, ifMatch))
        {
            throw new PreconditionFailedException(Messages.CollectionChangedElsewhere);
        }

        collections.Remove(collection);
        await collections.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Materializes a curated store checklist as a new wanted-only collection,
    /// exactly like the frontend mock did.
    /// </summary>
    public async Task<VersionedCollectionDto> ImportStoreListingAsync(string listingId, CancellationToken ct)
    {
        var listing = await storeListings.GetAsync(listingId, ct)
            ?? throw new NotFoundException(Messages.StoreListingNotFoundFor(listingId));
        if (await collections.ExistsAsync(listing.Id, ct))
        {
            throw new ConflictException(Messages.AlreadyInYourVault);
        }

        var tenantId = currentTenant.TenantId;
        var importedAt = timeProvider.GetUtcNow();
        var collection = new Collection
        {
            TenantId = tenantId,
            Id = listing.Id,
            Name = listing.Name,
            Description = listing.Description,
            LinkShare = true,
            CreatedAtUtc = importedAt,
            Groups = [.. listing.Groups.Select((name, i) => new Group
            {
                TenantId = tenantId,
                CollectionId = listing.Id,
                Id = name,
                Name = name,
                ParentId = null,
                Fields = [],
                // A curated checklist IS the declared set, so its item count
                // per group is the target — an imported list then reads
                // "0 / 5" instead of a bare "0 items". A group the listing
                // leaves empty declares nothing: 0 is not a series, and the
                // validator would reject it on the very next PUT.
                Target = listing.Items.Count(it => it.Group == name) is var count && count > 0 ? count : null,
                SortOrder = i,
            })],
            Items = [.. listing.Items.Select((it, i) => new Item
            {
                TenantId = tenantId,
                CollectionId = listing.Id,
                Id = it.Id,
                Name = it.Name,
                Year = it.Year,
                Value = it.Value,
                GroupId = it.Group,
                Img = it.Img,
                Tags = ["wanted"],
                Custom = [],
                // An imported checklist is a wantlist by definition: no copies.
                Copies = [],
                SortOrder = i,
                CreatedAtUtc = importedAt,
                Description = $"From the \"{listing.Name}\" curated checklist — not in your vault yet. Add a copy once you find it.",
            })],
        };

        collections.Add(collection);
        await collections.SaveChangesAsync(ct);
        return Versioned(collection);
    }

    /// <summary>Creates or replaces a single item.</summary>
    /// <remarks>
    /// Takes the <b>collection's</b> precondition, not an item-level one, and
    /// that is a deliberate trade. There is nowhere to put a per-item token: the
    /// client learns versions from the collection list, and an item token would
    /// have to travel inside <c>ItemDto</c> — which is the archive's format, and
    /// is no place for a concurrency token. So the choice is between a
    /// collection-wide precondition and none, and none loses updates: two people
    /// on the same item would overwrite each other in silence. The cost is a
    /// refusal when the collection moved for an unrelated reason, which costs a
    /// reload and no typed work.
    /// </remarks>
    public async Task<(VersionedItemDto Item, bool Created)> UpsertItemAsync(
        string collectionId,
        string itemId,
        ItemDto dto,
        IReadOnlyCollection<string> ifMatch,
        CancellationToken ct)
    {
        dto = dto with { Id = itemId }; // route id wins
        await itemValidator.ValidateAndThrowAsync(dto, ct);

        var collection = await collections.GetAsync(collectionId, ct)
            ?? throw new NotFoundException($"Collection '{collectionId}' not found.");

        if (!CollectionVersions.Matches(collection.Version, ifMatch))
        {
            throw new PreconditionFailedException(Messages.CollectionChangedElsewhere);
        }

        var existing = collection.Items.FirstOrDefault(i => i.Id == itemId);
        var created = existing is null;
        Item saved;
        if (existing is null)
        {
            var sortOrder = collection.Items.Count == 0 ? 0 : collection.Items.Max(i => i.SortOrder) + 1;
            saved = dto.ToEntity(collectionId, currentTenant.TenantId, sortOrder, timeProvider.GetUtcNow());
            collection.Items.Add(saved);
        }
        else
        {
            dto.ApplyTo(existing);
            saved = existing;
        }

        // Advances the aggregate's version even when the item's columns come out
        // identical: an accepted write has to hand back a token the caller can
        // use again, and one that left the version alone would return a tag that
        // is only accidentally still current.
        collections.Touch(collection);
        await collections.SaveChangesAsync(ct);
        // Downstream of the version check for the same reason as the PUT: a
        // refused item write must not clear an image's collection mark.
        await ReleaseCollectedImagesAsync(saved.PhotoIds, ct);
        return (
            new VersionedItemDto(CollectionVersions.ToETag(collection.Version), saved.ToDto()),
            created);
    }

    /// <summary>Removes one item and answers with the version afterwards.</summary>
    /// <remarks>
    /// <para>
    /// Deliberately takes no precondition. A delete is not derived from a
    /// document the way a replace is — "remove this item" says nothing about the
    /// rest of the collection, so a stale caller's delete removes exactly what
    /// they aimed at and nothing they never saw. Demanding an <c>If-Match</c>
    /// here would refuse a deliberate destructive act because something
    /// unrelated moved, and buy nothing for it.
    /// </para>
    /// <para>
    /// It still moves the version, and that half is not optional:
    /// <c>CollectionVersionInterceptor</c> sees the removed row and bumps the
    /// root. Without that, a client which had not seen the delete would PUT the
    /// whole document, pass its precondition, and resurrect the item.
    /// </para>
    /// <para>
    /// The new version comes back so the caller's token stays fresh — a client
    /// left holding the pre-delete tag would be refused on its very next save,
    /// for a change it made itself.
    /// </para>
    /// <para>
    /// A caller that <em>does</em> offer an <c>If-Match</c> is held to it, for
    /// the same reason as <see cref="DeleteAsync"/>.
    /// </para>
    /// </remarks>
    public async Task<string> DeleteItemAsync(
        string collectionId,
        string itemId,
        IReadOnlyCollection<string>? ifMatch,
        CancellationToken ct)
    {
        var collection = await collections.GetAsync(collectionId, ct)
            ?? throw new NotFoundException($"Collection '{collectionId}' not found.");

        if (ifMatch is not null && !CollectionVersions.Matches(collection.Version, ifMatch))
        {
            throw new PreconditionFailedException(Messages.CollectionChangedElsewhere);
        }

        var item = collection.Items.FirstOrDefault(i => i.Id == itemId);
        if (item is null)
        {
            // Idempotent, mirrors the mock — and answers with the version it is
            // already at, which is the truth for a request that changed nothing.
            return CollectionVersions.ToETag(collection.Version);
        }

        collection.Items.Remove(item);
        await collections.SaveChangesAsync(ct);
        return CollectionVersions.ToETag(collection.Version);
    }

    private static VersionedCollectionDto Versioned(Collection collection) =>
        new(CollectionVersions.ToETag(collection.Version), collection.ToDto());
}
