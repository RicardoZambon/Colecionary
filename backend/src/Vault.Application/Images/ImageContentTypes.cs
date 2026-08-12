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
}
