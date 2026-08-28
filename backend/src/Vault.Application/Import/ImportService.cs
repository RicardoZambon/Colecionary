using System.IO.Compression;
using System.Text.Json;
using FluentValidation;
using Vault.Application.Abstractions;
using Vault.Application.Archives;
using Vault.Application.Collections.Dtos;
using Vault.Application.Collections.Validators;
using Vault.Application.Common;
using Vault.Application.Images;
using Vault.Application.Images.Dtos;
using Vault.Application.Resources;
using Vault.Domain.Entities;

namespace Vault.Application.Import;

/// <summary>
/// Restores collections from an export archive, photos included.
/// </summary>
/// <remarks>
/// <para>
/// <b>Nothing already in the vault is overwritten.</b> An archived collection
/// keeps its own id when that id is free — so restoring one you deleted brings
/// back the same collection, links and all — and otherwise arrives as a new
/// collection with a fresh id and a renamed title. An import can therefore be
/// undone by deleting what it created, which is not true of a restore that
/// replaces in place.
/// </para>
/// <para>
/// <b>Images are copied, never referenced.</b> An id in an archive belongs to
/// the tenant that exported it; reusing it would either collide with a live row
/// or, worse, silently point one tenant's collection at another tenant's bytes.
/// Every photo is written afresh under a new id in the importing tenant's own
/// storage, and every reference to it — banner, icon, item photos — is remapped
/// to match. Framing rides along, so a restored photo is cropped where its owner
/// left it rather than snapping back to centre.
/// </para>
/// <para>
/// Both archive scopes are read here: a vault archive
/// (<c>collections.json</c>, an array) and a single-collection archive
/// (<c>collection.json</c>, one object) differ only in that entry.
/// </para>
/// </remarks>
public sealed class ImportService(
    ICollectionRepository collections,
    IImageRepository images,
    IImageStore store,
    ICurrentTenant currentTenant,
    TimeProvider timeProvider,
    IValidator<CollectionDto> collectionValidator)
{
    /// <summary>
    /// Reads <paramref name="archiveStream"/> — which must be seekable; the zip
    /// central directory lives at its end — and returns the collections as they
    /// were actually created, ids and image references already remapped.
    /// </summary>
    public async Task<IReadOnlyList<CollectionDto>> ImportAsync(
        Stream archiveStream,
        CancellationToken ct)
    {
        using var archive = OpenArchive(archiveStream);
        await EnsureThisBuildCanReadAsync(archive, ct);

        var incoming = await ReadCollectionsAsync(archive, ct);
        if (incoming.Count == 0)
        {
            throw new DomainRuleException(Messages.ArchiveHasNoCollections);
        }

        var photoMeta = await ReadImageMetadataAsync(archive, ct);

        var imported = new List<string>(incoming.Count);
        foreach (var source in incoming)
        {
            imported.Add(await ImportOneAsync(archive, source, photoMeta, ct));
        }

        // Images before collections: a row with no file is a broken picture on
        // screen, while a file with no row is unreachable garbage. Both
        // repositories share the request's DbContext today, so the first call
        // commits everything and the second is a no-op — writing both keeps the
        // ordering true if that ever stops being the case.
        await images.SaveChangesAsync(ct);
        await collections.SaveChangesAsync(ct);

        return await ReadBackAsync(imported, ct);
    }

    /// <summary>
    /// Re-reads what was just written, and answers with that.
    /// </summary>
    /// <remarks>
    /// The in-memory document would be cheaper and is almost the same thing —
    /// which is the problem. "Almost" is exactly the failure this costs a query
    /// per collection to rule out: a field the archive carried but the entity
    /// mapping forgot would still come back in the response, so the client would
    /// show it, the database would not have it, and nobody would notice until a
    /// reload. Answering from storage makes the response a statement about the
    /// vault rather than about this method's intentions, the way
    /// <c>CollectionService.UpdateAsync</c> already does.
    /// </remarks>
    private async Task<IReadOnlyList<CollectionDto>> ReadBackAsync(
        IReadOnlyList<string> ids,
        CancellationToken ct)
    {
        var saved = new List<CollectionDto>(ids.Count);
        foreach (var id in ids)
        {
            var collection = await collections.GetAsync(id, ct)
                ?? throw new NotFoundException(Messages.CollectionNotFoundFor(id));
            saved.Add(collection.ToDto());
        }

        return saved;
    }

    private static ZipArchive OpenArchive(Stream archiveStream)
    {
        try
        {
            return new ZipArchive(archiveStream, ZipArchiveMode.Read);
        }
        catch (InvalidDataException)
        {
            // Anything that isn't a zip at all — a JSON export from an older
            // build, a truncated download, the wrong file entirely.
            throw new DomainRuleException(Messages.ArchiveUnreadable);
        }
    }

    /// <summary>
    /// Refuses an archive this build cannot honestly read, before anything is
    /// written.
    /// </summary>
    /// <remarks>
    /// This is the manifest's whole job on the way in, and it is a narrow one:
    /// <em>may I read this at all</em>. What the archive holds is still decided
    /// by the entries actually present, which cannot lie the way a hand-edited
    /// manifest can — see <see cref="ReadCollectionsAsync"/>.
    /// <para>
    /// The check runs first so a rejection costs nothing: no photo copied, no
    /// row added, nothing to undo. See <see cref="ArchiveCompatibility"/> for
    /// why newer is refused while older is not.
    /// </para>
    /// </remarks>
    private static async Task EnsureThisBuildCanReadAsync(ZipArchive archive, CancellationToken ct)
    {
        if (archive.GetEntry(ArchiveEntries.Manifest) is not { } entry)
        {
            return; // Predates the manifest; its layout is v1 by definition.
        }

        var manifest = await ReadJsonAsync<ArchiveManifest>(entry, ct);
        switch (ArchiveCompatibility.Check(manifest))
        {
            case ArchiveReadability.ForeignFormat:
                throw new DomainRuleException(Messages.ArchiveUnreadable);
            case ArchiveReadability.FromANewerVersion:
                throw new DomainRuleException(
                    Messages.ArchiveFromNewerVersionFor(
                        manifest!.Version, ArchiveManifest.CurrentVersion));
        }
    }

    /// <summary>
    /// The archive's collections, whichever scope it was exported at. The
    /// manifest is not consulted for this: the entry that is actually present is
    /// the stronger evidence, and archives predating the manifest carry none.
    /// Compatibility is the manifest's one job, and
    /// <see cref="EnsureThisBuildCanReadAsync"/> has already done it.
    /// </summary>
    private static async Task<List<CollectionDto>> ReadCollectionsAsync(
        ZipArchive archive,
        CancellationToken ct)
    {
        if (archive.GetEntry(ArchiveEntries.Collection) is { } single)
        {
            var collection = await ReadJsonAsync<CollectionDto>(single, ct);
            return collection is null ? [] : [collection];
        }

        if (archive.GetEntry(ArchiveEntries.Vault) is { } many)
        {
            return await ReadJsonAsync<List<CollectionDto>>(many, ct) ?? [];
        }

        throw new DomainRuleException(Messages.ArchiveUnreadable);
    }

    /// <summary>
    /// Framing and content types, keyed by the id they had in the source vault.
    /// Absent in archives written before <c>images.json</c> existed, which is why
    /// this degrades to empty rather than failing: the photos are still there,
    /// and their file extensions still say what they are.
    /// </summary>
    private static async Task<Dictionary<Guid, ImageMetaDto>> ReadImageMetadataAsync(
        ZipArchive archive,
        CancellationToken ct)
    {
        if (archive.GetEntry(ArchiveEntries.Images) is not { } entry)
        {
            return [];
        }

        var rows = await ReadJsonAsync<List<ImageMetaDto>>(entry, ct) ?? [];
        // Last one wins rather than throwing: a duplicated id in a hand-edited
        // archive is not worth losing the whole restore over.
        return rows
            .GroupBy(row => row.Id)
            .ToDictionary(group => group.Key, group => group.Last());
    }

    private static async Task<T?> ReadJsonAsync<T>(ZipArchiveEntry entry, CancellationToken ct)
    {
        try
        {
            await using var stream = entry.Open();
            return await JsonSerializer.DeserializeAsync<T>(stream, ArchiveJson.Options, ct);
        }
        catch (JsonException)
        {
            throw new DomainRuleException(Messages.ArchiveUnreadable);
        }
        catch (InvalidDataException)
        {
            // A corrupt deflate stream inside an otherwise readable zip.
            throw new DomainRuleException(Messages.ArchiveUnreadable);
        }
    }

    /// <summary>Stages one archived collection, and returns the id it landed under.</summary>
    private async Task<string> ImportOneAsync(
        ZipArchive archive,
        CollectionDto source,
        Dictionary<Guid, ImageMetaDto> photoMeta,
        CancellationToken ct)
    {
        var tenantId = currentTenant.TenantId;
        var now = timeProvider.GetUtcNow();

        var (id, name) = await ResolveIdentityAsync(source, ct);
        var proposed = PublicIdRepair.Apply(source) with { Id = id, Name = name };

        // Before a single byte is written, and on the identity it will actually
        // be saved under — a hand-edited archive is untrusted input like any
        // request body, and a document that was never going to persist must not
        // leave a trail of copied photos behind it. Remapping afterwards only
        // ever drops photo references, so it cannot invalidate what passed here.
        await collectionValidator.ValidateAndThrowAsync(proposed, ct);

        var photos = await CopyPhotosAsync(archive, proposed, photoMeta, tenantId, ct);
        var dto = Remap(proposed, photos);

        collections.Add(new Collection
        {
            TenantId = tenantId,
            Id = dto.Id,
            Name = dto.Name,
            Description = dto.Description,
            LinkShare = dto.LinkShare,
            BannerImageId = dto.BannerImageId,
            IconImageId = dto.IconImageId,
            // Null means "follow the account", so it round-trips as null; a
            // collection pinned to a currency must come back pinned, or its
            // amounts silently re-read as some other money.
            Currency = dto.Currency,
            CreatedAtUtc = now,
            Groups = [.. dto.Groups.Select((group, i) => group.ToEntity(dto.Id, tenantId, i))],
            Items =
            [
                .. dto.Items.Select((item, i) =>
                    item.ToEntity(dto.Id, tenantId, i, AddedAt(item, now))),
            ],
            Members = [.. dto.Members.Select(member => member.ToEntity(dto.Id, tenantId))],
        });

        return dto.Id;
    }

    /// <summary>
    /// Under which id and name the archived collection lands.
    /// </summary>
    /// <remarks>
    /// Keeping the original id is what makes this a restore rather than a copy:
    /// bookmarks and shared links into a collection you deleted work again. It
    /// is only safe while the id is free — <c>ExistsAsync</c> is tenant-filtered,
    /// so "free" means free in <em>your</em> vault, not globally — and while the
    /// id is one this API would have issued, since an archive is untrusted text.
    /// Otherwise the collection is a new one, and says so in its name.
    /// </remarks>
    private async Task<(string Id, string Name)> ResolveIdentityAsync(
        CollectionDto source,
        CancellationToken ct)
    {
        var reusable = IdRules.PublicId().IsMatch(source.Id)
            && !await collections.ExistsAsync(source.Id, ct);

        return reusable
            ? (source.Id, source.Name)
            : ($"c{Guid.NewGuid():N}"[..16], ImportedName(source.Name));
    }

    /// <summary>
    /// Marks a collection as a second copy of one already in the vault, within
    /// the length the validator allows — a name at the limit must not become
    /// unsaveable purely by being imported.
    /// </summary>
    private static string ImportedName(string name)
    {
        var suffixed = Messages.ImportedCollectionNameFor(name);
        if (suffixed.Length <= CollectionRules.MaxNameLength)
        {
            return suffixed;
        }

        var overflow = suffixed.Length - CollectionRules.MaxNameLength;
        return Messages.ImportedCollectionNameFor(name[..Math.Max(0, name.Length - overflow)]);
    }

    /// <summary>
    /// When the item entered the collection. Unlike every other write path, the
    /// archive's own timestamp wins: a restore that stamped today would report
    /// a decade-old collection as forty items added this week, and quietly
    /// destroy the only history the vault keeps. Implausible values — absent, or
    /// from a clock ahead of ours — fall back to the import time.
    /// </summary>
    private static DateTimeOffset AddedAt(ItemDto item, DateTimeOffset now) =>
        item.CreatedAt is { } created && created > DateTimeOffset.UnixEpoch && created <= now
            ? created
            : now;

    /// <summary>
    /// Copies every photo the collection points at into this tenant's storage
    /// under fresh ids, and returns old id → new id.
    /// </summary>
    /// <remarks>
    /// Bytes first, then the row — the same asymmetry <c>ImageService</c> relies
    /// on: a file with no row is unreachable garbage, while a row with no file is
    /// a broken image on screen. A reference the archive doesn't carry bytes for
    /// is simply absent from the map, and <see cref="Remap"/> drops it; a
    /// collection missing a photo still restores, which is the whole point of
    /// having a backup.
    /// </remarks>
    private async Task<Dictionary<Guid, Guid>> CopyPhotosAsync(
        ZipArchive archive,
        CollectionDto source,
        Dictionary<Guid, ImageMetaDto> photoMeta,
        Guid tenantId,
        CancellationToken ct)
    {
        var copied = new Dictionary<Guid, Guid>();
        var now = timeProvider.GetUtcNow();

        foreach (var originalId in CollectionImages.ReferencedBy(source))
        {
            if (FindPhoto(archive, originalId) is not { } photo)
            {
                continue;
            }

            var (entry, extension) = photo;

            photoMeta.TryGetValue(originalId, out var meta);
            var contentType = meta?.ContentType ?? ImageContentTypes.FromExtension(extension);
            if (contentType is null || !ImageContentTypes.IsAllowed(contentType))
            {
                throw new DomainRuleException(Messages.ImageTypeUnsupported);
            }

            var bytes = await ReadPhotoAsync(entry, ct);
            var image = new StoredImage
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ContentType = contentType.ToLowerInvariant(),
                CreatedAtUtc = now,
                // Null stays null: "never framed" is a real state, distinct from
                // "framed dead centre", and it must survive the round-trip.
                FocalX = meta?.Focal?.X,
                FocalY = meta?.Focal?.Y,
            };

            await store.SaveAsync(image.TenantId, image.Id, image.ContentType, bytes, ct);
            images.Add(image);
            copied[originalId] = image.Id;
        }

        return copied;
    }

    /// <summary>
    /// The archive entry holding a photo, found by id rather than by an assumed
    /// extension — the export names files after the content type, and an archive
    /// with no <c>images.json</c> leaves that extension as the only clue to what
    /// the bytes are.
    /// </summary>
    private static (ZipArchiveEntry Entry, string Extension)? FindPhoto(
        ZipArchive archive,
        Guid id)
    {
        var prefix = ArchiveEntries.ImageDirectory + id.ToString("D");
        foreach (var entry in archive.Entries)
        {
            // "<prefix>.<ext>" exactly — a StartsWith alone would also match a
            // longer id sharing this one's opening characters.
            if (entry.FullName.Length > prefix.Length
                && entry.FullName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
                && entry.FullName[prefix.Length] == '.')
            {
                return (entry, entry.FullName[prefix.Length..]);
            }
        }

        return null;
    }

    /// <summary>
    /// Reads a photo, refusing anything past the upload limit.
    /// </summary>
    /// <remarks>
    /// The cap is enforced while reading rather than from
    /// <c>ZipArchiveEntry.Length</c>, which is a claim the archive makes about
    /// itself: a zip bomb declares a kilobyte and expands to gigabytes. Reading
    /// one byte past the limit is enough to know it was exceeded, and the read
    /// stops there. Failing loudly rather than skipping the photo is deliberate —
    /// an archive we produced cannot contain one, so this is a doctored file, and
    /// silently dropping its images would look like a successful restore.
    /// </remarks>
    private static async Task<byte[]> ReadPhotoAsync(ZipArchiveEntry entry, CancellationToken ct)
    {
        await using var stream = entry.Open();
        using var buffer = new MemoryStream();

        var probe = new byte[81920];
        while (true)
        {
            var read = await stream.ReadAsync(probe, ct);
            if (read == 0)
            {
                break;
            }

            buffer.Write(probe, 0, read);
            if (buffer.Length > ImageService.MaxBytes)
            {
                throw new DomainRuleException(Messages.ImageTooLarge);
            }
        }

        if (buffer.Length == 0)
        {
            throw new DomainRuleException(Messages.ImageFileEmpty);
        }

        return buffer.ToArray();
    }

    /// <summary>
    /// Points the collection at the image ids its photos were actually copied
    /// to. A reference with no copied photo is
    /// dropped rather than left dangling: a null banner renders as a placeholder,
    /// while a banner id pointing at nothing renders as a broken image forever.
    /// </summary>
    private static CollectionDto Remap(CollectionDto source, Dictionary<Guid, Guid> photos)
    {
        Guid? Mapped(Guid? original) =>
            original is { } value && photos.TryGetValue(value, out var replacement)
                ? replacement
                : null;

        return source with
        {
            BannerImageId = Mapped(source.BannerImageId),
            IconImageId = Mapped(source.IconImageId),
            Items =
            [
                .. source.Items.Select(item => item with
                {
                    PhotoIds = [.. item.PhotoIds.Select(photoId => Mapped(photoId)).OfType<Guid>()],
                }),
            ],
        };
    }
}
