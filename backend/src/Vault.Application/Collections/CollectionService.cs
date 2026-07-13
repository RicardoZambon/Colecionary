using FluentValidation;
using Vault.Application.Abstractions;
using Vault.Application.Collections.Dtos;
using Vault.Application.Common;
using Vault.Domain.Entities;

namespace Vault.Application.Collections;

public class CollectionService(
    ICollectionRepository collections,
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

    public async Task<CollectionDto> CreateAsync(CreateCollectionRequest request, CancellationToken ct)
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
        return collection.ToDto();
    }

    /// <summary>Full-document replace, mirroring the frontend contract.</summary>
    public async Task<CollectionDto> UpdateAsync(string id, CollectionDto dto, CancellationToken ct)
    {
        await collectionValidator.ValidateAndThrowAsync(dto, ct);
        var tracked = await collections.GetAsync(id, ct)
            ?? throw new NotFoundException($"Collection '{id}' not found.");

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
            Groups = [.. dto.Groups.Select((g, i) => g.ToEntity(id, tenantId, i))],
            Items = [.. dto.Items.Select((it, i) => it.ToEntity(id, tenantId, i, now))],
            Members = [.. dto.Members.Select(m => m.ToEntity(id, tenantId))],
        };

        collections.ReplaceGraph(tracked, replacement);
        await collections.SaveChangesAsync(ct);

        var saved = await collections.GetAsync(id, ct)
            ?? throw new NotFoundException($"Collection '{id}' not found.");
        return saved.ToDto();
    }

    public async Task DeleteAsync(string id, CancellationToken ct)
    {
        var collection = await collections.GetAsync(id, ct)
            ?? throw new NotFoundException($"Collection '{id}' not found.");
        collections.Remove(collection);
        await collections.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Materializes a curated store checklist as a new wanted-only collection,
    /// exactly like the frontend mock did.
    /// </summary>
    public async Task<CollectionDto> ImportStoreListingAsync(string listingId, CancellationToken ct)
    {
        var listing = await storeListings.GetAsync(listingId, ct)
            ?? throw new NotFoundException($"Store listing '{listingId}' not found.");
        if (await collections.ExistsAsync(listing.Id, ct))
        {
            throw new ConflictException("Already in your vault");
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
                Price = 0,
                Condition = Domain.Enums.Condition.Good,
                Tags = ["wanted"],
                Custom = [],
                Owned = false,
                SortOrder = i,
                CreatedAtUtc = importedAt,
                Description = $"From the \"{listing.Name}\" curated checklist — not in your vault yet. Mark it as owned once you find it.",
            })],
        };

        collections.Add(collection);
        await collections.SaveChangesAsync(ct);
        return collection.ToDto();
    }

    public async Task<(ItemDto Item, bool Created)> UpsertItemAsync(
        string collectionId,
        string itemId,
        ItemDto dto,
        CancellationToken ct)
    {
        dto = dto with { Id = itemId }; // route id wins
        await itemValidator.ValidateAndThrowAsync(dto, ct);

        var collection = await collections.GetAsync(collectionId, ct)
            ?? throw new NotFoundException($"Collection '{collectionId}' not found.");

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

        await collections.SaveChangesAsync(ct);
        return (saved.ToDto(), created);
    }

    public async Task DeleteItemAsync(string collectionId, string itemId, CancellationToken ct)
    {
        var collection = await collections.GetAsync(collectionId, ct)
            ?? throw new NotFoundException($"Collection '{collectionId}' not found.");

        var item = collection.Items.FirstOrDefault(i => i.Id == itemId);
        if (item is null)
        {
            return; // idempotent, mirrors the mock
        }

        collection.Items.Remove(item);
        await collections.SaveChangesAsync(ct);
    }
}
