using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Vault.Application.Images;
using Vault.Application.Images.Dtos;

namespace Vault.IntegrationTests;

/// <summary>
/// Framing an image is the one image write that isn't an upload, so it is the
/// one place where the deliberately unfiltered read behind the anonymous byte
/// endpoint would be a hole. These tests pin that the write goes through the
/// tenant filter instead.
/// </summary>
[Collection(nameof(ApiCollection))]
public class ImageFocalTests(VaultApiFactory factory)
{
    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    private static MultipartFormDataContent BuildForm()
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(TinyPng);
        content.Headers.ContentType = new("image/png");
        form.Add(content, "file", "pixel.png");
        return form;
    }

    private static async Task<ImageUploadResponse> UploadAsync(HttpClient client) =>
        (await (await client.PostAsync("/api/images", BuildForm()))
            .Content.ReadFromJsonAsync<ImageUploadResponse>())!;

    private static async Task<ImageMetaDto?> FindMetaAsync(HttpClient client, Guid id)
    {
        var all = await client.GetFromJsonAsync<List<ImageMetaDto>>("/api/images/meta");
        return all!.SingleOrDefault(m => m.Id == id);
    }

    [Fact]
    public async Task FreshUpload_IsUnframed()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var image = await UploadAsync(client);

        var meta = await FindMetaAsync(client, image.Id);

        Assert.NotNull(meta);
        // Null, not a defaulted 0.5/0.5: "never framed" has to stay tellable from
        // "deliberately centred" so a later subject-detection pass can fill it in
        // without overwriting a human choice.
        Assert.Null(meta.Focal);
    }

    [Fact]
    public async Task Focal_RoundTripsAndCanBeCleared()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var image = await UploadAsync(client);

        var set = await client.PutAsJsonAsync(
            $"/api/images/{image.Id}/focal", new SetFocalRequest(new FocalPointDto(0.25, 0.8)));
        Assert.Equal(HttpStatusCode.OK, set.StatusCode);

        var meta = await FindMetaAsync(client, image.Id);
        Assert.Equal(0.25, meta!.Focal!.X);
        Assert.Equal(0.8, meta.Focal.Y);

        var cleared = await client.PutAsJsonAsync(
            $"/api/images/{image.Id}/focal", new SetFocalRequest(null));
        Assert.Equal(HttpStatusCode.OK, cleared.StatusCode);
        Assert.Null((await FindMetaAsync(client, image.Id))!.Focal);
    }

    [Fact]
    public async Task Focal_MustNameAPointOnThePicture()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var image = await UploadAsync(client);

        var response = await client.PutAsJsonAsync(
            $"/api/images/{image.Id}/focal", new SetFocalRequest(new FocalPointDto(1.4, 0.5)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SettingFocal_RequiresAuthentication()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var image = await UploadAsync(client);

        var anonymous = factory.CreateClient();
        var denied = await anonymous.PutAsJsonAsync(
            $"/api/images/{image.Id}/focal", new SetFocalRequest(new FocalPointDto(0.1, 0.1)));

        // The byte read is anonymous by design; this write is emphatically not.
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);

        var listing = await anonymous.GetAsync("/api/images/meta");
        Assert.Equal(HttpStatusCode.Unauthorized, listing.StatusCode);
    }

    [Fact]
    public async Task OneTenantCannotReframeAnothersImage()
    {
        await factory.EnsureSecondTenantAsync();

        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var acmeImage = await UploadAsync(marcus);

        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);
        var attempt = await gary.PutAsJsonAsync(
            $"/api/images/{acmeImage.Id}/focal", new SetFocalRequest(new FocalPointDto(0, 0)));

        // 404, not 403: routed through the global query filter, a foreign id
        // simply does not exist, so the attempt learns nothing about it either.
        Assert.Equal(HttpStatusCode.NotFound, attempt.StatusCode);

        // And the owner's image is untouched.
        Assert.Null((await FindMetaAsync(marcus, acmeImage.Id))!.Focal);
    }

    [Fact]
    public async Task MetaListing_OnlyCarriesTheCallersOwnTenant()
    {
        await factory.EnsureSecondTenantAsync();

        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var acmeImage = await UploadAsync(marcus);

        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);
        var globexImage = await UploadAsync(gary);

        Assert.Null(await FindMetaAsync(gary, acmeImage.Id));
        Assert.Null(await FindMetaAsync(marcus, globexImage.Id));
        Assert.NotNull(await FindMetaAsync(marcus, acmeImage.Id));
    }

    [Fact]
    public async Task Export_CarriesFramingSoABackupCanRestoreIt()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var image = await UploadAsync(client);
        await client.PutAsJsonAsync(
            $"/api/images/{image.Id}/focal", new SetFocalRequest(new FocalPointDto(0.6, 0.2)));

        await using var stream = await client.GetStreamAsync("/api/export");
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer);
        using var archive = new ZipArchive(buffer, ZipArchiveMode.Read);

        var entry = archive.GetEntry("images.json");
        Assert.NotNull(entry);

        await using var entryStream = entry.Open();
        var metas = await JsonSerializer.DeserializeAsync<List<ImageMetaDto>>(
            entryStream, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        var exported = metas!.Single(m => m.Id == image.Id);
        Assert.Equal(0.6, exported.Focal!.X);
        Assert.Equal(0.2, exported.Focal.Y);
    }
}
