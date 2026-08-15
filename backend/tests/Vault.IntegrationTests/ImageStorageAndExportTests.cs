using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vault.Application.Collections.Dtos;
using Vault.Application.Images;

namespace Vault.IntegrationTests;

/// <summary>
/// Covers the two things that changed when image bytes left the database: they
/// land on disk under their own tenant's directory, and the export is a zip that
/// carries them alongside the collection JSON.
/// </summary>
[Collection(nameof(ApiCollection))]
public class ImageStorageAndExportTests(VaultApiFactory factory)
{
    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    [Fact]
    public async Task UploadedBytes_LeaveTheDatabaseAndLandUnderTheirTenantsDirectory()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var upload = await client.PostAsync("/api/images", BuildForm());
        var image = (await upload.Content.ReadFromJsonAsync<ImageUploadResponse>())!;

        var tenantId = await factory.QueryDbAsync(db =>
            db.Tenants.Where(t => t.Slug == "acme-vault").Select(t => t.Id).SingleAsync());

        var expected = Path.Combine(factory.ImageRoot, tenantId.ToString("D"), $"{image.Id:D}.png");
        Assert.True(File.Exists(expected), $"expected image bytes at {expected}");
        Assert.Equal(TinyPng, await File.ReadAllBytesAsync(expected));

        // The row is metadata only now — the bytes are not duplicated in SQL.
        var row = await factory.QueryDbAsync(db => db.Images
            .IgnoreQueryFilters()
            .SingleAsync(i => i.Id == image.Id));
        Assert.Equal(tenantId, row.TenantId);
        Assert.Equal("image/png", row.ContentType);
    }

    [Fact]
    public async Task TwoTenants_NeverShareAnImageDirectory()
    {
        await factory.EnsureSecondTenantAsync();

        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var acmeImage = (await (await marcus.PostAsync("/api/images", BuildForm()))
            .Content.ReadFromJsonAsync<ImageUploadResponse>())!;

        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);
        var globexImage = (await (await gary.PostAsync("/api/images", BuildForm()))
            .Content.ReadFromJsonAsync<ImageUploadResponse>())!;

        var (acmeTenant, globexTenant) = await factory.QueryDbAsync(async db => (
            await db.Tenants.Where(t => t.Slug == "acme-vault").Select(t => t.Id).SingleAsync(),
            await db.Tenants.Where(t => t.Slug == "globex").Select(t => t.Id).SingleAsync()));

        Assert.NotEqual(acmeTenant, globexTenant);

        var acmeDir = Path.Combine(factory.ImageRoot, acmeTenant.ToString("D"));
        var globexDir = Path.Combine(factory.ImageRoot, globexTenant.ToString("D"));

        Assert.True(File.Exists(Path.Combine(acmeDir, $"{acmeImage.Id:D}.png")));
        Assert.True(File.Exists(Path.Combine(globexDir, $"{globexImage.Id:D}.png")));

        // The point of partitioning: neither tenant's bytes appear in the other's
        // directory, so a directory is a safe unit to copy, quota or delete.
        Assert.False(File.Exists(Path.Combine(globexDir, $"{acmeImage.Id:D}.png")));
        Assert.False(File.Exists(Path.Combine(acmeDir, $"{globexImage.Id:D}.png")));
    }

    [Fact]
    public async Task Export_IsAZipCarryingCollectionsAndTheirImages()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var image = (await (await client.PostAsync("/api/images", BuildForm()))
            .Content.ReadFromJsonAsync<ImageUploadResponse>())!;

        var response = await client.GetAsync("/api/export");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/zip", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("vault-export.zip", response.Content.Headers.ContentDisposition?.ToString());

        using var archive = new ZipArchive(await response.Content.ReadAsStreamAsync(), ZipArchiveMode.Read);

        var json = archive.GetEntry("collections.json");
        Assert.NotNull(json);
        await using var jsonStream = json.Open();
        var collections = await JsonSerializer.DeserializeAsync<List<CollectionDto>>(
            jsonStream, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(collections);
        Assert.Contains(collections, c => c.Id == "retro");

        var entry = archive.GetEntry($"images/{image.Id:D}.png");
        Assert.NotNull(entry);
        await using var bytes = entry.Open();
        using var buffer = new MemoryStream();
        await bytes.CopyToAsync(buffer);
        Assert.Equal(TinyPng, buffer.ToArray());
    }

    [Fact]
    public async Task Export_RequiresAuthentication()
    {
        var anonymous = factory.CreateClient();
        var response = await anonymous.GetAsync("/api/export");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Export_OnlyCarriesTheCallersOwnTenant()
    {
        await factory.EnsureSecondTenantAsync();

        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var acmeImage = (await (await marcus.PostAsync("/api/images", BuildForm()))
            .Content.ReadFromJsonAsync<ImageUploadResponse>())!;

        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);
        using var archive = new ZipArchive(
            await (await gary.GetAsync("/api/export")).Content.ReadAsStreamAsync(), ZipArchiveMode.Read);

        // Globex must see neither acme's collections nor acme's image bytes.
        Assert.Null(archive.GetEntry($"images/{acmeImage.Id:D}.png"));

        await using var jsonStream = archive.GetEntry("collections.json")!.Open();
        var collections = await JsonSerializer.DeserializeAsync<List<CollectionDto>>(
            jsonStream, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.DoesNotContain(collections!, c => c.Id == "retro");
    }

    private static MultipartFormDataContent BuildForm()
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(TinyPng);
        content.Headers.ContentType = new("image/png");
        form.Add(content, "file", "pixel.png");
        return form;
    }
}
