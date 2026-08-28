namespace Vault.Application.Images;

/// <summary>
/// The image formats Vault accepts, and their file extensions. Single source of
/// truth: upload validation, the on-disk file name and the export archive all
/// read from here, so adding a format is a one-line change that can't leave the
/// three out of step.
/// </summary>
public static class ImageContentTypes
{
    public static readonly string[] Allowed =
        ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

    public static bool IsAllowed(string contentType) =>
        Allowed.Contains(contentType, StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Extension for a stored image, leading dot included. Only ever called with
    /// a content type that already passed <see cref="IsAllowed"/>; the fallback
    /// exists so a future format can't produce an extensionless path.
    /// </summary>
    public static string ExtensionFor(string contentType) => contentType.ToLowerInvariant() switch
    {
        "image/jpeg" => ".jpg",
        "image/png" => ".png",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        "image/avif" => ".avif",
        _ => ".bin",
    };

    /// <summary>
    /// The inverse of <see cref="ExtensionFor"/>, or null for an extension we
    /// don't serve. Only the import needs it, and only as a fallback: an archive
    /// carries <c>images.json</c> with the real content type, but one written
    /// before that entry existed — or assembled by hand — leaves the file name
    /// as the sole evidence of what a photo is.
    /// </summary>
    public static string? FromExtension(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        ".avif" => "image/avif",
        _ => null,
    };
}
