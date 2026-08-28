using SkiaSharp;
using Vault.Application.Abstractions;

namespace Vault.Infrastructure.Storage;

/// <summary>
/// <see cref="IImageDeriver"/> on SkiaSharp.
/// </summary>
/// <remarks>
/// SkiaSharp rather than ImageSharp, which was the first choice and is the more
/// ergonomic API: ImageSharp 4.x requires a paid Six Labors licence and emits a
/// build warning without one, and warnings are errors here. SkiaSharp is MIT
/// with no such condition, which is what a self-hosted MIT app can actually
/// ship. The cost is native assets — hence the
/// <c>SkiaSharp.NativeAssets.Linux.NoDependencies</c> reference, which carries
/// its own libSkiaSharp and so needs nothing added to the runtime image.
/// </remarks>
public sealed class SkiaImageDeriver : IImageDeriver
{
    /// <summary>
    /// Everything derived comes out as WebP: it carries photographs and
    /// transparency equally well, so one output format covers JPEG, PNG and AVIF
    /// sources without branching, and it is smaller than all three at the same
    /// perceived quality.
    /// </summary>
    public const string DerivedContentType = "image/webp";

    /// <summary>
    /// High enough that a photograph shows no artefacts at the sizes these
    /// variants render at, low enough to be worth doing at all.
    /// </summary>
    private const int Quality = 82;

    /// <summary>
    /// Refuses to decode absurdly large images. The upload cap is on *file* size,
    /// and a 5 MB file can hold a 30000×30000 image needing gigabytes once
    /// decoded — the classic decompression bomb. 50 megapixels is far above any
    /// camera a collector would use and far below where decoding hurts.
    /// </summary>
    private const long MaxPixels = 50_000_000;

    public bool CanDerive(string contentType) =>
        // GIF alone is excluded: resizing decodes the first frame and would drop
        // the animation, and a still silently replacing a moving picture is a
        // worse outcome than serving the original bytes at every size.
        !string.Equals(contentType, "image/gif", StringComparison.OrdinalIgnoreCase);

    public ImageDimensions? Measure(ReadOnlyMemory<byte> data)
    {
        using var stream = new SKMemoryStream(data.ToArray());
        using var codec = SKCodec.Create(stream);
        // Null for bytes Skia does not recognise as an image at all.
        return codec is null ? null : new ImageDimensions(codec.Info.Width, codec.Info.Height);
    }

    public DerivedImage Derive(ReadOnlyMemory<byte> data, int longestEdge, CancellationToken ct)
    {
        var declared = Measure(data)
            ?? throw new InvalidOperationException("Bytes are not a decodable image.");

        if ((long)declared.Width * declared.Height > MaxPixels)
        {
            throw new InvalidOperationException(
                $"Image is {declared.Width}×{declared.Height}, above the {MaxPixels:N0} pixel decode limit.");
        }

        ct.ThrowIfCancellationRequested();

        // Decoding through SKBitmap rather than SKImage: it applies the EXIF
        // orientation, without which portrait phone photos derive on their side.
        using var source = SKBitmap.Decode(data.ToArray())
            ?? throw new InvalidOperationException("Image could not be decoded.");

        var (width, height) = Fit(source.Width, source.Height, longestEdge);

        using var resized = source.Resize(
            new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul),
            new SKSamplingOptions(SKCubicResampler.Mitchell))
            ?? throw new InvalidOperationException("Image could not be resized.");

        ct.ThrowIfCancellationRequested();

        using var image = SKImage.FromBitmap(resized);
        using var encoded = image.Encode(SKEncodedImageFormat.Webp, Quality)
            ?? throw new InvalidOperationException("Image could not be encoded as WebP.");

        return new DerivedImage(
            encoded.ToArray(),
            DerivedContentType,
            new ImageDimensions(width, height));
    }

    /// <summary>
    /// The size that fits inside a <paramref name="longestEdge"/> square,
    /// preserving aspect ratio and **never enlarging** — inventing pixels makes
    /// a bigger file that looks worse than the original stretched by the browser.
    /// Rounds up to at least 1px so an extreme panorama cannot derive to zero.
    /// </summary>
    private static (int Width, int Height) Fit(int width, int height, int longestEdge)
    {
        var longest = Math.Max(width, height);
        if (longest <= longestEdge)
        {
            return (width, height);
        }

        var scale = (double)longestEdge / longest;
        return (Math.Max(1, (int)Math.Round(width * scale)), Math.Max(1, (int)Math.Round(height * scale)));
    }
}
