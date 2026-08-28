namespace Vault.Domain.Enums;

/// <summary>
/// The sizes an image is served at, named for what they are for rather than for
/// how many pixels they are — a card is a card whatever the design does to its
/// dimensions later.
/// </summary>
/// <remarks>
/// These are wire values: they arrive as <c>?size=thumb</c> and the frontend
/// mirrors the same three names. Renaming one is an API change.
/// </remarks>
public enum ImageVariant
{
    /// <summary>Item cards, grid tiles, gallery thumbnails, mosaic tiles.</summary>
    Thumb,

    /// <summary>
    /// Gallery main image, collection banner, the framing editor's stage. The
    /// default for a request that does not ask, so every caller that predates
    /// variants gets the useful size rather than the original.
    /// </summary>
    Display,

    /// <summary>
    /// The bytes as uploaded. Only the lightbox's "open original" and the export
    /// archive want these.
    /// </summary>
    Full,
}

/// <summary>The longest edge each variant is resized to fit inside.</summary>
public static class ImageVariants
{
    public const int ThumbEdge = 400;
    public const int DisplayEdge = 1400;

    /// <summary>
    /// Null for <see cref="ImageVariant.Full"/>, which is not resized at all.
    /// </summary>
    public static int? LongestEdge(ImageVariant variant) => variant switch
    {
        ImageVariant.Thumb => ThumbEdge,
        ImageVariant.Display => DisplayEdge,
        _ => null,
    };
}
