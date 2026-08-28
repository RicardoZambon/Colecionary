using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vault.Application.Archives;
using Vault.Application.Collections.Dtos;
using Vault.Application.Images;
using Vault.Application.Images.Dtos;

namespace Vault.IntegrationTests;

/// <summary>
/// Covers exporting one collection and reading an archive back in.
/// </summary>
/// <remarks>
/// The properties worth pinning are the ones a backup is bought for: a restore
/// brings the photos back as bytes and not as dangling ids, it brings the
/// framing back with them, it never overwrites what is already in the vault,
/// and an archive from one tenant lands entirely inside whichever tenant
/// imports it.
/// </remarks>
[Collection(nameof(ApiCollection))]
public class CollectionArchiveTests(VaultApiFactory factory)
{
    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task CollectionExport_CarriesThatCollectionsPhotosAndNoOthers()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var banner = await UploadAsync(client);
        var unrelated = await UploadAsync(client);

        var collection = await SeedCollectionAsync(client, banner, photo: null);

        using var archive = await DownloadArchiveAsync(client, $"/api/export/collections/{collection.Id}");

        // The whole point of the per-collection scope: everything this
        // collection points at, and nothing else the tenant happens to own.
        Assert.NotNull(archive.GetEntry($"images/{banner:D}.png"));
        Assert.Null(archive.GetEntry($"images/{unrelated:D}.png"));

        var manifest = await ReadEntryAsync<ArchiveManifest>(archive, ArchiveEntries.Manifest);
        Assert.Equal(ArchiveManifest.CollectionKind, manifest!.Kind);

        var packed = await ReadEntryAsync<CollectionDto>(archive, ArchiveEntries.Collection);
        Assert.Equal(collection.Id, packed!.Id);
        // A single-collection archive is one object, not the vault's array.
        Assert.Null(archive.GetEntry(ArchiveEntries.Vault));
    }

    [Fact]
    public async Task RestoringADeletedCollection_BringsBackItsPhotosUnderFreshIds()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var banner = await UploadAsync(client);
        var photo = await UploadAsync(client);
        await SetFocalAsync(client, photo, new FocalPointDto(0.25, 0.75));

        var collection = await SeedCollectionAsync(client, banner, photo);
        var archive = await DownloadBytesAsync(client, $"/api/export/collections/{collection.Id}");

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/collections/{collection.Id}")).StatusCode);

        var restored = Assert.Single(await ImportAsync(client, archive));

        // The id is free again, so the restore is a restore: old links work.
        Assert.Equal(collection.Id, restored.Id);
        Assert.Equal(collection.Name, restored.Name);

        // The bytes are copied, never referenced — an archived id belongs to the
        // vault that exported it and must not be reused here.
        Assert.NotNull(restored.BannerImageId);
        Assert.NotEqual(banner, restored.BannerImageId);
        var restoredPhoto = Assert.Single(restored.Items.Single(i => i.PhotoIds.Count > 0).PhotoIds);
        Assert.NotEqual(photo, restoredPhoto);

        // `size=full`: the claim is that the *original* bytes came back through
        // the archive, and a bare read would answer with a re-encoded rendition.
        var served = await client.GetAsync($"/api/images/{restoredPhoto:D}?size=full");
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal(TinyPng, await served.Content.ReadAsByteArrayAsync());

        // Framing lives on the image row, so nothing in the collection JSON
        // carries it. Losing it would silently re-centre every restored photo.
        var meta = await client.GetFromJsonAsync<List<ImageMetaDto>>("/api/images/meta");
        var focal = meta!.Single(m => m.Id == restoredPhoto).Focal;
        Assert.Equal(0.25, focal!.X);
        Assert.Equal(0.75, focal.Y);
    }

    [Fact]
    public async Task ImportingOverALiveCollection_LandsBesideItInsteadOfReplacingIt()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var collection = await SeedCollectionAsync(client, await UploadAsync(client), photo: null);
        var archive = await DownloadBytesAsync(client, $"/api/export/collections/{collection.Id}");

        var imported = Assert.Single(await ImportAsync(client, archive));

        Assert.NotEqual(collection.Id, imported.Id);
        Assert.NotEqual(collection.Name, imported.Name);
        Assert.StartsWith(collection.Name, imported.Name, StringComparison.Ordinal);

        // Nothing already in the vault was touched: the original is still there,
        // under its own id, alongside the copy.
        var all = await client.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        var original = all!.Single(c => c.Id == collection.Id);
        Assert.Equal(collection.Name, original.Name);
        Assert.Equal(collection.Items.Count, original.Items.Count);
        Assert.Contains(all!, c => c.Id == imported.Id);
    }

    [Fact]
    public async Task AVaultArchive_ImportsThroughTheSameEndpoint()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var before = await client.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        var archive = await DownloadBytesAsync(client, "/api/export");

        var imported = await ImportAsync(client, archive);

        // Every collection in the vault came back — as copies, since all their
        // ids are still taken.
        Assert.Equal(before!.Count, imported.Count);
        Assert.All(imported, c => Assert.DoesNotContain(before, original => original.Id == c.Id));
    }

    [Fact]
    public async Task ImportedPhotos_LandInTheImportersOwnTenant()
    {
        await factory.EnsureSecondTenantAsync();

        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var acmePhoto = await UploadAsync(marcus);
        var collection = await SeedCollectionAsync(marcus, banner: null, photo: acmePhoto);
        var archive = await DownloadBytesAsync(marcus, $"/api/export/collections/{collection.Id}");

        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);
        var imported = Assert.Single(await ImportAsync(gary, archive));
        var importedPhoto = Assert.Single(imported.Items.Single(i => i.PhotoIds.Count > 0).PhotoIds);

        var globexTenant = await factory.QueryDbAsync(db =>
            db.Tenants.Where(t => t.Slug == "globex").Select(t => t.Id).SingleAsync());

        // The row and the bytes both belong to the tenant that imported them —
        // the archived id was never reused, so the two vaults share nothing.
        var row = await factory.QueryDbAsync(db =>
            db.Images.IgnoreQueryFilters().SingleAsync(i => i.Id == importedPhoto));
        Assert.Equal(globexTenant, row.TenantId);
        Assert.True(File.Exists(
            Path.Combine(factory.ImageRoot, globexTenant.ToString("D"), $"{importedPhoto:D}.png")));

        // And acme keeps a collection of its own, untouched by someone else's import.
        var acme = await marcus.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        Assert.Contains(acme!, c => c.Id == collection.Id);
    }

    [Fact]
    public async Task Import_RejectsAFileThatIsNotAnArchive()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var response = await PostArchiveAsync(client, Encoding.UTF8.GetBytes("{\"not\":\"a zip\"}"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Import_RejectsAZipWithNoCollectionInIt()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");

        using var empty = new MemoryStream();
        using (var archive = new ZipArchive(empty, ZipArchiveMode.Create, leaveOpen: true))
        {
            archive.CreateEntry("readme.txt");
        }

        var response = await PostArchiveAsync(client, empty.ToArray());
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Import_RefusesAnArchiveFromANewerFormatVersion_AndWritesNothing()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var collection = await SeedCollectionAsync(client, await UploadAsync(client), photo: null);
        var archive = await DownloadBytesAsync(client, $"/api/export/collections/{collection.Id}");
        var before = await client.GetFromJsonAsync<List<CollectionDto>>("/api/collections");

        var response = await PostArchiveAsync(
            client,
            WithManifestVersion(archive, ArchiveManifest.CurrentVersion + 1));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        // The refusal names both versions, so the user knows it is their build
        // that is behind and not their file that is broken.
        var detail = await response.Content.ReadAsStringAsync();
        Assert.Contains((ArchiveManifest.CurrentVersion + 1).ToString(), detail, StringComparison.Ordinal);

        // And it cost nothing: the gate runs before the first byte is written,
        // so a rejected archive leaves no half-restored collection behind.
        var after = await client.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        Assert.Equal(before!.Count, after!.Count);
    }

    [Fact]
    public async Task Import_ReadsAnArchiveWhoseManifestIsOlderThanTodays()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var collection = await SeedCollectionAsync(client, banner: null, photo: null);
        var archive = await DownloadBytesAsync(client, $"/api/export/collections/{collection.Id}");

        // Older is readable by construction: every entry v1 wrote is one this
        // build still understands. Only newer is refused.
        var imported = Assert.Single(await ImportAsync(client, WithManifestVersion(archive, 1)));
        Assert.Equal(collection.Items.Count, imported.Items.Count);
    }

    [Fact]
    public async Task Import_BringsBackACollectionsPinnedCurrency()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var collection = await SeedCollectionAsync(client, banner: null, photo: null);
        var pinned = await (await client.PutAsJsonAsync(
            $"/api/collections/{collection.Id}",
            collection with { Currency = "BRL" })).Content.ReadFromJsonAsync<CollectionDto>();
        Assert.Equal("BRL", pinned!.Currency);

        var archive = await DownloadBytesAsync(client, $"/api/export/collections/{collection.Id}");
        var imported = Assert.Single(await ImportAsync(client, archive));

        // A collection whose amounts are read in one currency must not come back
        // silently reading in another. The response is what storage holds, so
        // this pins the row and not merely the reply.
        Assert.Equal("BRL", imported.Currency);
        var all = await client.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        Assert.Equal("BRL", all!.Single(c => c.Id == imported.Id).Currency);
    }

    [Fact]
    public async Task Import_RequiresAuthentication()
    {
        var response = await PostArchiveAsync(factory.CreateClient(), TinyPng);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CollectionExport_IsNotFoundForAnIdTheTenantDoesNotOwn()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var response = await client.GetAsync("/api/export/collections/no-such-collection");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- helpers ---

    /// <summary>
    /// A collection of this tenant's own, with a banner and/or one item photo,
    /// so a test never has to mutate the shared demo data other tests read.
    /// </summary>
    private static async Task<CollectionDto> SeedCollectionAsync(
        HttpClient client,
        Guid? banner,
        Guid? photo)
    {
        var created = await (await client.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest($"Coleção {Guid.NewGuid():N}"[..24], "for archive tests")))
            .Content.ReadFromJsonAsync<CollectionDto>();

        var item = new ItemDto(
            Id: "archive-item",
            Name: "Archived item",
            Description: string.Empty,
            Year: 1994,
            Value: 12m,
            GroupId: string.Empty,
            Tags: [],
            Img: string.Empty,
            Custom: [],
            PhotoIds: photo is { } id ? [id] : []);

        var filled = created! with { BannerImageId = banner, Items = [item] };
        var saved = await (await client.PutAsJsonAsync($"/api/collections/{filled.Id}", filled))
            .Content.ReadFromJsonAsync<CollectionDto>();
        return saved!;
    }

    private static async Task<Guid> UploadAsync(HttpClient client)
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(TinyPng);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(content, "file", "pixel.png");

        var response = await client.PostAsync("/api/images", form);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ImageUploadResponse>())!.Id;
    }

    private static async Task SetFocalAsync(HttpClient client, Guid id, FocalPointDto focal)
    {
        var response = await client.PutAsJsonAsync($"/api/images/{id:D}/focal", new SetFocalRequest(focal));
        response.EnsureSuccessStatusCode();
    }

    private static async Task<byte[]> DownloadBytesAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync();
    }

    private static async Task<ZipArchive> DownloadArchiveAsync(HttpClient client, string url) =>
        new(new MemoryStream(await DownloadBytesAsync(client, url)), ZipArchiveMode.Read);

    private static async Task<List<CollectionDto>> ImportAsync(HttpClient client, byte[] archive)
    {
        var response = await PostArchiveAsync(client, archive);
        if (!response.IsSuccessStatusCode)
        {
            // The ProblemDetails body, not just the status: an import rejects
            // for a dozen reasons and the detail names which one.
            throw new Xunit.Sdk.XunitException(await response.Content.ReadAsStringAsync());
        }
        return (await response.Content.ReadFromJsonAsync<List<CollectionDto>>())!;
    }

    private static Task<HttpResponseMessage> PostArchiveAsync(HttpClient client, byte[] archive)
    {
        var content = new ByteArrayContent(archive);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        return client.PostAsync("/api/import", content);
    }

    /// <summary>
    /// The same archive, claiming a different layout version.
    /// </summary>
    /// <remarks>
    /// Rebuilt entry by entry rather than edited in place: a zip's central
    /// directory records each entry's size, so overwriting one with a longer
    /// value corrupts the file — and the test would then pass for the wrong
    /// reason, rejected as unreadable rather than as too new.
    /// </remarks>
    private static byte[] WithManifestVersion(byte[] archive, int version)
    {
        using var source = new ZipArchive(new MemoryStream(archive), ZipArchiveMode.Read);
        using var rebuilt = new MemoryStream();
        using (var target = new ZipArchive(rebuilt, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var entry in source.Entries)
            {
                using var writing = target.CreateEntry(entry.FullName).Open();
                if (entry.FullName == ArchiveEntries.Manifest)
                {
                    JsonSerializer.Serialize(
                        writing,
                        new ArchiveManifest(
                            ArchiveManifest.FormatName,
                            version,
                            ArchiveManifest.CollectionKind,
                            DateTimeOffset.UnixEpoch),
                        Json);
                    continue;
                }

                using var reading = entry.Open();
                reading.CopyTo(writing);
            }
        }

        return rebuilt.ToArray();
    }

    private static async Task<T?> ReadEntryAsync<T>(ZipArchive archive, string name)
    {
        await using var stream = archive.GetEntry(name)!.Open();
        return await JsonSerializer.DeserializeAsync<T>(stream, Json);
    }
}
