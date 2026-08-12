namespace Vault.Infrastructure.Storage;

public sealed class ImageStorageOptions
{
    public const string SectionName = "ImageStorage";

    /// <summary>
    /// Directory holding the per-tenant image folders. A relative path resolves
    /// against the app's content root, which keeps the default self-contained
    /// for local development; point it at a mounted volume in production.
    /// </summary>
    public string Root { get; set; } = Path.Combine("App_Data", "images");
}
