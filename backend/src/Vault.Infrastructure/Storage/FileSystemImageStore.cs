using Vault.Application.Abstractions;
using Vault.Application.Images;
using Vault.Domain.Enums;

namespace Vault.Infrastructure.Storage;

/// <summary>
/// Stores image bytes on local disk as
/// <c>{root}/{tenantId}/{imageId}.{ext}</c>.
/// </summary>
/// <remarks>
/// <para>
/// **One directory per tenant.** Both path segments are GUIDs formatted by us,
/// never caller-supplied strings, so no input can traverse out of its tenant's
/// folder. The layout also means a tenant's images can be copied, quota'd or
/// deleted as a unit.
/// </para>
/// <para>
/// The extension is derived from the content type, which is immutable once an
/// image row is written (there is no update path for images) — otherwise
/// retyping an image would silently orphan the file it names.
/// </para>
/// </remarks>
public sealed class FileSystemImageStore(string root) : IImageStore
{
    /// <summary>Kept out of the originals folder — see <see cref="SaveDerivedAsync"/>.</summary>
    public const string DerivedDirectory = "derived";

    public async Task SaveAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        ReadOnlyMemory<byte> data,
        CancellationToken ct)
    {
        var path = PathFor(tenantId, imageId, contentType);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await WriteAtomicAsync(path, data, ct);
    }

    public Task<Stream?> OpenReadAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        CancellationToken ct)
    {
        return Task.FromResult(OpenIfPresent(PathFor(tenantId, imageId, contentType)));
    }

    public async Task<byte[]?> ReadAllAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        CancellationToken ct)
    {
        var path = PathFor(tenantId, imageId, contentType);
        return File.Exists(path) ? await File.ReadAllBytesAsync(path, ct) : null;
    }

    public async Task SaveDerivedAsync(
        Guid tenantId,
        Guid imageId,
        ImageVariant variant,
        string contentType,
        ReadOnlyMemory<byte> data,
        CancellationToken ct)
    {
        var path = DerivedPathFor(tenantId, imageId, variant, contentType);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await WriteAtomicAsync(path, data, ct);
    }

    public Task<Stream?> OpenDerivedAsync(
        Guid tenantId,
        Guid imageId,
        ImageVariant variant,
        string contentType,
        CancellationToken ct) =>
        Task.FromResult(OpenIfPresent(DerivedPathFor(tenantId, imageId, variant, contentType)));

    private string PathFor(Guid tenantId, Guid imageId, string contentType) => Path.Combine(
        root,
        tenantId.ToString("D"),
        imageId.ToString("D") + ImageContentTypes.ExtensionFor(contentType));

    /// <summary>
    /// <c>{root}/{tenant}/derived/{id}_{variant}.{ext}</c>. The variant name is
    /// lowercased from the enum rather than interpolated from a string, so no
    /// caller-supplied text ever reaches the path.
    /// </summary>
    private string DerivedPathFor(Guid tenantId, Guid imageId, ImageVariant variant, string contentType) =>
        Path.Combine(
            root,
            tenantId.ToString("D"),
            DerivedDirectory,
            $"{imageId:D}_{variant.ToString().ToLowerInvariant()}"
                + ImageContentTypes.ExtensionFor(contentType));

    private static Stream? OpenIfPresent(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        return new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 64 * 1024,
            useAsync: true);
    }

    /// <summary>
    /// Write to a temp name and move into place: a reader that races a write
    /// sees either no file or the whole file, never a prefix of one. The move is
    /// atomic within a directory, which is where both paths are.
    /// </summary>
    private static async Task WriteAtomicAsync(string path, ReadOnlyMemory<byte> data, CancellationToken ct)
    {
        // Unique per write: two requests deriving the same missing variant at
        // once would otherwise share one staging path and truncate each other.
        var staging = $"{path}.{Guid.NewGuid():N}.tmp";
        await File.WriteAllBytesAsync(staging, data, ct);
        File.Move(staging, path, overwrite: true);
    }
}
