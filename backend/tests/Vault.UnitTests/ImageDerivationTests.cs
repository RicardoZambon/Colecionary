using SkiaSharp;
using Vault.Application.Abstractions;
using Vault.Domain.Enums;
using Vault.Infrastructure.Storage;

namespace Vault.UnitTests;

/// <summary>
/// Resizing, and the on-disk layout the resized copies live in. No database and
/// no container, so CI catches a regression in either.
/// </summary>
public sealed class ImageDerivationTests : IDisposable
{
    private readonly string _root =
        Path.Combine(Path.GetTempPath(), $"vault-derive-tests-{Guid.NewGuid():N}");

    private readonly SkiaImageDeriver _deriver = new();

    /// <summary>A real PNG of the given size — the deriver decodes for real.</summary>
    private static byte[] Png(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bitmap);
        canvas.Clear(SKColors.CornflowerBlue);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    [Fact]
    public void Measure_ReadsTheIntrinsicSize()
    {
        Assert.Equal(new ImageDimensions(640, 480), _deriver.Measure(Png(640, 480)));
    }

    [Fact]
    public void Measure_IsNullForBytesThatAreNotAnImage()
    {
        // What the upload path uses to reject a file the browser mislabelled.
        Assert.Null(_deriver.Measure(new byte[] { 0x00, 0x01, 0x02, 0x03 }));
    }

    [Fact]
    public void Derive_FitsInsideTheLongestEdge_PreservingAspectRatio()
    {
        var result = _deriver.Derive(Png(4000, 2000), ImageVariants.ThumbEdge, default);

        Assert.Equal(ImageVariants.ThumbEdge, result.Size.Width);
        Assert.Equal(ImageVariants.ThumbEdge / 2, result.Size.Height);
    }

    [Fact]
    public void Derive_FitsAPortraitByItsHeight()
    {
        // "Longest edge" is not "width" — a portrait photo has to be bounded by
        // the other dimension or it comes out taller than the box it fits in.
        var result = _deriver.Derive(Png(1000, 3000), 300, default);

        Assert.Equal(300, result.Size.Height);
        Assert.Equal(100, result.Size.Width);
    }

    [Fact]
    public void Derive_NeverEnlarges()
    {
        // Upscaling produces a bigger file that looks worse than letting the
        // browser stretch the original.
        var result = _deriver.Derive(Png(120, 90), ImageVariants.DisplayEdge, default);

        Assert.Equal(120, result.Size.Width);
        Assert.Equal(90, result.Size.Height);
    }

    [Fact]
    public void Derive_ProducesWebpWhateverWentIn()
    {
        var result = _deriver.Derive(Png(800, 600), 400, default);

        Assert.Equal("image/webp", result.ContentType);
        Assert.Equal(new ImageDimensions(400, 300), _deriver.Measure(result.Bytes));
    }

    [Fact]
    public void Derive_ActuallyShrinksTheBytes()
    {
        // The whole point of the feature: a surface must download less than the
        // original, not merely a differently-shaped file of the same size.
        var original = Png(2400, 1800);
        var result = _deriver.Derive(original, ImageVariants.ThumbEdge, default);

        Assert.True(
            result.Bytes.Length < original.Length,
            $"derived {result.Bytes.Length} bytes was not smaller than {original.Length}");
    }

    [Fact]
    public void CanDerive_RefusesGif_SoAnimationSurvives()
    {
        Assert.False(_deriver.CanDerive("image/gif"));
        Assert.True(_deriver.CanDerive("image/jpeg"));
        Assert.True(_deriver.CanDerive("image/png"));
        Assert.True(_deriver.CanDerive("image/webp"));
    }

    [Fact]
    public async Task Derived_FilesSitBesideTheOriginals_NotAmongThem()
    {
        // The export walks the tenant's own directory for originals; a derived
        // copy landing there would end up inside every backup.
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        var image = Guid.NewGuid();

        await store.SaveAsync(tenant, image, "image/png", Png(10, 10), default);
        await store.SaveDerivedAsync(
            tenant, image, ImageVariant.Thumb, "image/webp", new byte[] { 1, 2, 3 }, default);

        var originals = Path.Combine(_root, tenant.ToString("D"));
        Assert.Single(Directory.GetFiles(originals));
        Assert.True(File.Exists(
            Path.Combine(originals, FileSystemImageStore.DerivedDirectory, $"{image:D}_thumb.webp")));
    }

    [Fact]
    public async Task Derived_IsReadBackPerVariant()
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        var image = Guid.NewGuid();

        await store.SaveDerivedAsync(
            tenant, image, ImageVariant.Thumb, "image/webp", new byte[] { 0xA }, default);
        await store.SaveDerivedAsync(
            tenant, image, ImageVariant.Display, "image/webp", new byte[] { 0xB }, default);

        Assert.Equal(0xA, await FirstByteAsync(store, tenant, image, ImageVariant.Thumb));
        Assert.Equal(0xB, await FirstByteAsync(store, tenant, image, ImageVariant.Display));
    }

    [Fact]
    public async Task Derived_IsNullBeforeItHasBeenGenerated()
    {
        // The state every pre-existing image and every archive import starts in.
        var store = new FileSystemImageStore(_root);
        var stream = await store.OpenDerivedAsync(
            Guid.NewGuid(), Guid.NewGuid(), ImageVariant.Thumb, "image/webp", default);

        Assert.Null(stream);
    }

    private static async Task<int> FirstByteAsync(
        FileSystemImageStore store,
        Guid tenant,
        Guid image,
        ImageVariant variant)
    {
        await using var stream = await store.OpenDerivedAsync(tenant, image, variant, "image/webp", default);
        Assert.NotNull(stream);
        return stream.ReadByte();
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }
}
