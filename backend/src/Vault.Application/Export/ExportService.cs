using System.IO.Compression;
using System.Text.Json;
using Vault.Application.Abstractions;
using Vault.Application.Archives;
using Vault.Application.Collections;
using Vault.Application.Images;
using Vault.Domain.Entities;

namespace Vault.Application.Export;

/// <summary>
/// Builds an export archive: a collection graph as JSON plus every image it
/// references. Two scopes, one format — the whole vault, or a single collection.
/// </summary>
/// <remarks>
/// This used to be a browser-side JSON blob built from whatever the client had
/// in memory. It moved server-side because images can no longer be reached from
/// the client as data — and because the same global query filters that protect
/// every other read now scope the export, instead of it being whatever the tab
/// happened to have loaded.
/// <para>
/// The two scopes write the same entry names and the same JSON shapes, differing
/// only in whether the payload is one collection or an array of them, so
/// <c>ImportService</c> reads both through one code path.
/// </para>
/// </remarks>
public sealed class ExportService(
    CollectionService collections,
    IImageRepository images,
    IImageStore store,
    TimeProvider timeProvider)
{
    /// <summary>
    /// Writes every collection the caller's tenant owns, with every image it
    /// owns — not merely the referenced ones, since a whole-vault archive is a
    /// backup and an image not currently on an item is still the user's.
    /// </summary>
    /// <remarks>
    /// <paramref name="destination"/> must accept synchronous writes:
    /// ZipArchive emits its central directory synchronously on dispose.
    /// ExportController therefore hands this a temp file rather than the
    /// response body.
    /// <para>
    /// Nothing is held in memory whole: the JSON is serialised straight into its
    /// entry and each image is copied stream-to-stream, so a tenant with a
    /// gigabyte of photos costs no more RAM than one with a single icon.
    /// </para>
    /// </remarks>
    public async Task WriteVaultArchiveAsync(Stream destination, CancellationToken ct)
    {
        // leaveOpen: the caller owns the destination.
        using var archive = new ZipArchive(destination, ZipArchiveMode.Create, leaveOpen: true);

        await WriteManifestAsync(archive, ArchiveManifest.VaultKind, ct);
        await WriteJsonAsync(archive, ArchiveEntries.Vault, await collections.ListAsync(ct), ct);
        await WriteImagesAsync(archive, await images.ListForCurrentTenantAsync(ct), ct);
    }

    /// <summary>
    /// Writes one collection and the images it references, and returns the file
    /// name the download should land as. Same constraints on
    /// <paramref name="destination"/> as <see cref="WriteVaultArchiveAsync"/>.
    /// </summary>
    /// <remarks>
    /// Scoped to the referenced images, unlike the vault archive: a collection is
    /// a self-contained thing to hand to someone or to restore on its own, and
    /// packing the tenant's unrelated photos into it would be a quiet leak of
    /// everything else the user has.
    /// </remarks>
    public async Task<string> WriteCollectionArchiveAsync(
        string collectionId,
        Stream destination,
        CancellationToken ct)
    {
        // Ahead of the ZipArchive: a missing id must surface as a clean 404, not
        // as a 404 written into a half-built zip the browser already started
        // saving under a .zip name.
        var collection = await collections.GetAsync(collectionId, ct);

        using (var archive = new ZipArchive(destination, ZipArchiveMode.Create, leaveOpen: true))
        {
            await WriteManifestAsync(archive, ArchiveManifest.CollectionKind, ct);
            await WriteJsonAsync(archive, ArchiveEntries.Collection, collection, ct);

            var referenced = CollectionImages.ReferencedBy(collection);
            await WriteImagesAsync(archive, await images.ListForCurrentTenantAsync(referenced, ct), ct);
        }

        return ArchiveFileName.ForCollection(collection.Name, collection.Id);
    }

    private Task WriteManifestAsync(ZipArchive archive, string kind, CancellationToken ct) =>
        WriteJsonAsync(
            archive,
            ArchiveEntries.Manifest,
            new ArchiveManifest(
                ArchiveManifest.FormatName,
                ArchiveManifest.CurrentVersion,
                kind,
                timeProvider.GetUtcNow()),
            ct);

    private static async Task WriteJsonAsync<T>(
        ZipArchive archive,
        string name,
        T payload,
        CancellationToken ct)
    {
        var entry = archive.CreateEntry(name, CompressionLevel.Optimal);
        await using var stream = entry.Open();
        await JsonSerializer.SerializeAsync(stream, payload, ArchiveJson.Options, ct);
    }

    private async Task WriteImagesAsync(
        ZipArchive archive,
        List<StoredImage> rows,
        CancellationToken ct)
    {
        // Framing lives on the image row, not in the collection graph, so the
        // collection JSON alone would silently drop it — the archive would
        // restore every photo centred again.
        await WriteJsonAsync(archive, ArchiveEntries.Images, rows.Select(ImageMapper.ToMeta), ct);

        foreach (var image in rows)
        {
            var bytes = await store.OpenReadAsync(image.TenantId, image.Id, image.ContentType, ct);
            if (bytes is null)
            {
                // A row whose file is gone must not fail the whole export — the
                // rest of the archive is still exactly what the user asked for.
                continue;
            }

            await using var source = bytes;
            var name = ArchiveEntries.ImageDirectory
                + $"{image.Id:D}{ImageContentTypes.ExtensionFor(image.ContentType)}";
            // Stored, not deflated: every format we accept is already compressed,
            // so deflate would burn CPU on each image to save roughly nothing.
            var entry = archive.CreateEntry(name, CompressionLevel.NoCompression);
            await using var entryStream = entry.Open();
            await source.CopyToAsync(entryStream, ct);
        }
    }
}
