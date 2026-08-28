using System.Net;
using System.Net.Http.Json;
using SkiaSharp;
using Vault.Application.Images;
using Vault.Application.Images.Dtos;

namespace Vault.IntegrationTests;

/// <summary>
/// Serving resized renditions: what each <c>?size=</c> returns, and what a
/// caller that does not ask gets.
/// </summary>
[Collection(nameof(ApiCollection))]
public class ImageVariantTests(VaultApiFactory factory)
{
    /// <summary>A real 2000×1500 PNG — big enough that every variant shrinks it.</summary>
    private static byte[] LargePng()
    {
        using var bitmap = new SKBitmap(2000, 1500);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.Teal);
        // A shape, so the encoder cannot collapse the whole thing to nothing.
        canvas.DrawCircle(700, 500, 380, new SKPaint { Color = SKColors.Orange });
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    private static async Task<Guid> UploadAsync(HttpClient client, byte[] bytes, string contentType, string name)
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new(contentType);
        form.Add(content, "file", name);

        var response = await client.PostAsync("/api/images", form);
        response.EnsureSuccessStatusCode();
        var uploaded = await response.Content.ReadFromJsonAsync<ImageUploadResponse>();
        return uploaded!.Id;
    }

    private static (int Width, int Height) SizeOf(byte[] bytes)
    {
        using var codec = SKCodec.Create(new SKMemoryStream(bytes))!;
        return (codec.Info.Width, codec.Info.Height);
    }

    [Fact]
    public async Task ThumbAndDisplay_AreResized_AndFullIsNot()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var original = LargePng();
        var id = await UploadAsync(client, original, "image/png", "big.png");

        var thumb = await client.GetByteArrayAsync($"/api/images/{id}?size=thumb");
        var display = await client.GetByteArrayAsync($"/api/images/{id}?size=display");
        var full = await client.GetByteArrayAsync($"/api/images/{id}?size=full");

        Assert.Equal((400, 300), SizeOf(thumb));
        Assert.Equal((1400, 1050), SizeOf(display));
        Assert.Equal((2000, 1500), SizeOf(full));

        // The reason the feature exists: a card downloads a fraction of a photo.
        Assert.True(thumb.Length < display.Length);
        Assert.True(display.Length < original.Length);
    }

    [Fact]
    public async Task NoSize_ServesDisplay_SoEveryOlderCallerImproves()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var id = await UploadAsync(client, LargePng(), "image/png", "big.png");

        var response = await client.GetAsync($"/api/images/{id}");
        response.EnsureSuccessStatusCode();

        Assert.Equal("image/webp", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal((1400, 1050), SizeOf(await response.Content.ReadAsByteArrayAsync()));
    }

    [Fact]
    public async Task ResizedRenditionsAreWebp_AndTheOriginalKeepsItsOwnType()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var id = await UploadAsync(client, LargePng(), "image/png", "big.png");

        var thumb = await client.GetAsync($"/api/images/{id}?size=thumb");
        var full = await client.GetAsync($"/api/images/{id}?size=full");

        Assert.Equal("image/webp", thumb.Content.Headers.ContentType?.MediaType);
        Assert.Equal("image/png", full.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task TheReadStaysAnonymous_AtEverySize()
    {
        // <img> tags cannot send Authorization headers; adding variants must not
        // have quietly changed that.
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var id = await UploadAsync(client, LargePng(), "image/png", "big.png");

        var anonymous = factory.CreateClient();
        foreach (var size in new[] { "thumb", "display", "full" })
        {
            var response = await anonymous.GetAsync($"/api/images/{id}?size={size}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
    }

    [Fact]
    public async Task UploadRecordsTheIntrinsicSize()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var id = await UploadAsync(client, LargePng(), "image/png", "big.png");

        var metas = await client.GetFromJsonAsync<List<ImageMetaDto>>("/api/images/meta");
        var meta = metas!.Single(m => m.Id == id);

        Assert.Equal(2000, meta.Width);
        Assert.Equal(1500, meta.Height);
    }

    [Fact]
    public async Task BytesThatAreNotAnImageAreRejected_WhateverTheyClaimToBe()
    {
        // The browser sets the content type from the file extension, so a
        // mislabelled file is the normal way garbage arrives.
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent("this is not a picture"u8.ToArray());
        content.Headers.ContentType = new("image/png");
        form.Add(content, "file", "lies.png");

        var response = await client.PostAsync("/api/images", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task AGifIsServedWhole_SoItKeepsMoving()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        // A 1×1 GIF is enough: what matters is that no variant re-encodes it.
        var gif = Convert.FromBase64String("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
        var id = await UploadAsync(client, gif, "image/gif", "spin.gif");

        foreach (var size in new[] { "thumb", "display", "full" })
        {
            var response = await client.GetAsync($"/api/images/{id}?size={size}");
            response.EnsureSuccessStatusCode();
            Assert.Equal("image/gif", response.Content.Headers.ContentType?.MediaType);
            Assert.Equal(gif, await response.Content.ReadAsByteArrayAsync());
        }
    }
}
