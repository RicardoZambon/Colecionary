namespace Vault.Application.Abstractions;

/// <summary>An image's pixel dimensions, as read from its bytes.</summary>
public sealed record ImageDimensions(int Width, int Height);

/// <summary>The result of resizing: the bytes and the content type to serve them as.</summary>
public sealed record DerivedImage(byte[] Bytes, string ContentType, ImageDimensions Size);

/// <summary>
/// Resizes uploaded images into the sizes surfaces actually render at.
/// </summary>
/// <remarks>
/// An interface rather than a static helper for two reasons. It keeps the
/// imaging library out of Application — the layer rule — and it makes the
/// library itself swappable: the implementation is ImageSharp today, chosen
/// because it is pure managed and so costs the Docker image nothing, but its
/// licence is only royalty-free while this project stays OSI-licensed. If that
/// ever changes, SkiaSharp goes behind this same interface and nothing above it
/// moves.
/// </remarks>
public interface IImageDeriver
{
    /// <summary>
    /// True when this content type can be resized at all. False for formats
    /// where resizing would destroy something — an animated GIF loses its
    /// animation — and those are served as their original bytes at every size.
    /// </summary>
    bool CanDerive(string contentType);

    /// <summary>
    /// Reads the intrinsic size without decoding the whole image, or null if the
    /// bytes are not an image this library understands.
    /// </summary>
    ImageDimensions? Measure(ReadOnlyMemory<byte> data);

    /// <summary>
    /// Resizes to fit inside <paramref name="longestEdge"/>, preserving aspect
    /// ratio and never enlarging: an image already smaller than the target is
    /// returned re-encoded but not upscaled, because inventing pixels makes a
    /// bigger file that looks worse.
    /// </summary>
    DerivedImage Derive(ReadOnlyMemory<byte> data, int longestEdge, CancellationToken ct);
}
