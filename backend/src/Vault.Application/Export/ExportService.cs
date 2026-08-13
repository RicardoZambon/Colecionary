using System.IO.Compression;
using System.Text.Json;
using Vault.Application.Abstractions;
using Vault.Application.Collections;
using Vault.Application.Images;

namespace Vault.Application.Export;

/// <summary>
/// Builds a tenant's export archive: the collection graph as JSON plus every
/// image it references.
/// </summary>
/// <remarks>
/// This used to be a browser-side JSON blob built from whatever the client had
/// in memory. It moved server-side because images can no longer be reached from
/// the client as data — and because the same global query filters that protect
/// every other read now scope the export, instead of it being whatever the tab
/// happened to have loaded.
/// </remarks>
public sealed class ExportService(
    CollectionService collections,
    IImageRepository images,
    IImageStore store)
{
    public const string FileName = "vault-export.zip";

    /// <summary>
    /// Matches the API's own wire format (camelCase; the DTOs carry enums as
    /// strings already), so an exported document is the same shape callers see
    /// from <c>GET /api/collections</c>.
    /// </summary>
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web) { WriteIndented = true };

    /// <summary>
    /// Writes the archive to <paramref name="destination"/>, which must accept
    /// synchronous writes — ZipArchive emits its central directory synchronously
    /// on dispose. ExportController therefore hands this a temp file rather than
    /// the response body.
    /// </summary>
    /// <remarks>
    /// Nothing is held in memory whole: the JSON is serialised straight into its
    /// entry and each image is copied stream-to-stream, so a tenant with a
    /// gigabyte of photos costs no more RAM than one with a single icon.
    /// </remarks>
    public async Task WriteArchiveAsync(Stream destination, CancellationToken ct)
    {
        // leaveOpen: the caller owns the response body.
        using var archive = new ZipArchive(destination, ZipArchiveMode.Create, leaveOpen: true);

        var dtos = await collections.ListAsync(ct);
        var jsonEntry = archive.CreateEntry("collections.json", CompressionLevel.Optimal);
        await using (var jsonStream = jsonEntry.Open())
        {
            await JsonSerializer.SerializeAsync(jsonStream, dtos, JsonOptions, ct);
        }

        var rows = await images.ListForCurrentTenantAsync(ct);

        // Framing lives on the image row, not in the collection graph, so
        // collections.json alone would silently drop it — the archive would
        // restore every photo centred again.
        var metaEntry = archive.CreateEntry("images.json", CompressionLevel.Optimal);
        await using (var metaStream = metaEntry.Open())
        {
            await JsonSerializer.SerializeAsync(metaStream, rows.Select(ImageMapper.ToMeta), JsonOptions, ct);
        }

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
            var name = $"images/{image.Id:D}{ImageContentTypes.ExtensionFor(image.ContentType)}";
            // Stored, not deflated: every format we accept is already compressed,
            // so deflate would burn CPU on each image to save roughly nothing.
            var entry = archive.CreateEntry(name, CompressionLevel.NoCompression);
            await using var entryStream = entry.Open();
            await source.CopyToAsync(entryStream, ct);
        }
    }
}
