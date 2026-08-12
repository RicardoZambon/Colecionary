using Vault.Application.Abstractions;
using Vault.Application.Images;

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
    public async Task SaveAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        ReadOnlyMemory<byte> data,
        CancellationToken ct)
    {
        var path = PathFor(tenantId, imageId, contentType);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        // Write to a temp name and move into place: a reader that races an
        // upload sees either no file or the whole file, never a prefix of one.
        // The move is atomic within a directory, which is where both paths are.
        var staging = path + ".uploading";
        await File.WriteAllBytesAsync(staging, data, ct);
        File.Move(staging, path, overwrite: true);
    }

    public Task<Stream?> OpenReadAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        CancellationToken ct)
    {
        var path = PathFor(tenantId, imageId, contentType);
        if (!File.Exists(path))
        {
            return Task.FromResult<Stream?>(null);
        }

        Stream stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 64 * 1024,
            useAsync: true);
        return Task.FromResult<Stream?>(stream);
    }

    private string PathFor(Guid tenantId, Guid imageId, string contentType) => Path.Combine(
        root,
        tenantId.ToString("D"),
        imageId.ToString("D") + ImageContentTypes.ExtensionFor(contentType));
}
