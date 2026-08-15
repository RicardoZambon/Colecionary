using System.Net;
using System.Net.Http.Json;
using Vault.Application.Collections.Dtos;
using Vault.Application.Images;

namespace Vault.IntegrationTests;

[Collection(nameof(ApiCollection))]
public class ImagesAndTimestampsTests(VaultApiFactory factory)
{
    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    [Fact]
    public async Task Images_UploadRequiresAuth_ReadIsCapabilityBased()
    {
        var anonymous = factory.CreateClient();
        var denied = await anonymous.PostAsync("/api/images", BuildForm());
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);

        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var uploaded = await client.PostAsync("/api/images", BuildForm());
        Assert.Equal(HttpStatusCode.Created, uploaded.StatusCode);
        var response = (await uploaded.Content.ReadFromJsonAsync<ImageUploadResponse>())!;

        // Read is anonymous — the GUID is the capability (img tags can't send auth).
        var fetched = await anonymous.GetAsync($"/api/images/{response.Id}");
        Assert.Equal(HttpStatusCode.OK, fetched.StatusCode);
        Assert.Equal("image/png", fetched.Content.Headers.ContentType?.MediaType);
        Assert.Equal(TinyPng, await fetched.Content.ReadAsByteArrayAsync());

        var missing = await anonymous.GetAsync($"/api/images/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Images_RejectsNonImagePayloads()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent([1, 2, 3]);
        content.Headers.ContentType = new("application/pdf");
        form.Add(content, "file", "not-an-image.pdf");

        var response = await client.PostAsync("/api/images", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ItemPhotos_RoundTripThroughUpsert()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var upload = await client.PostAsync("/api/images", BuildForm());
        var image = (await upload.Content.ReadFromJsonAsync<ImageUploadResponse>())!;

        var item = new ItemDto(
            "i-photo-test", "Photographed", "", 2020, 10, "Sega", [], "x.jpg", [],
            Copies: [new ItemCopyDto("i-photo-test_c1", "Good", 5)],
            PhotoIds: [image.Id]);
        var put = await client.PutAsJsonAsync($"/api/collections/retro/items/{item.Id}", item);
        Assert.Equal(HttpStatusCode.Created, put.StatusCode);
        var saved = (await put.Content.ReadFromJsonAsync<ItemDto>())!;
        Assert.Equal([image.Id], saved.PhotoIds);
        Assert.Equal(5, Assert.Single(saved.Copies).Price); // copies and photos coexist
        Assert.NotNull(saved.CreatedAt); // server-stamped

        await client.DeleteAsync($"/api/collections/retro/items/{item.Id}");
    }

    [Fact]
    public async Task Collections_ListInCreationOrder_WithSeededRecentTimestamps()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var collections = (await client.GetFromJsonAsync<List<CollectionDto>>("/api/collections"))!;

        // Seed order preserved — matches the design's sidebar.
        Assert.Equal("retro", collections[0].Id);
        Assert.Equal("pokemon", collections[1].Id);

        // The design's "recent additions" are real timestamps now.
        var n64 = collections.Single(c => c.Id == "retro").Items.Single(i => i.Id == "n64");
        Assert.NotNull(n64.CreatedAt);
        Assert.True(DateTimeOffset.UtcNow - n64.CreatedAt < TimeSpan.FromHours(3));
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
