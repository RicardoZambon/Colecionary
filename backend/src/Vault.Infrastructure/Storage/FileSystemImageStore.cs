using System.Runtime.CompilerServices;
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

    /// <inheritdoc />
    /// <remarks>
    /// Everything is found by the id's own prefix rather than by rebuilding each
    /// name: renditions are re-encoded to WebP, so a JPEG's cache entries are
    /// <c>.webp</c> and reconstructing them from <paramref name="contentType"/>
    /// would delete nothing and leave the cache growing for ever. The prefix is
    /// a GUID we format ourselves and a GUID cannot be a prefix of another one,
    /// so the pattern cannot widen onto a neighbour.
    /// </remarks>
    public Task<StoreDeletion> DeleteAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        CancellationToken ct)
    {
        var tenantDirectory = Path.Combine(root, tenantId.ToString("D"));
        var id = imageId.ToString("D");

        var files = 0;
        var bytes = 0L;

        // "{id}." covers the original under any extension, plus the staging file
        // a torn write leaves as "{id}.{ext}.{n}.tmp".
        foreach (var path in Matching(tenantDirectory, id + "."))
        {
            Remove(path, ref files, ref bytes);
        }

        // "{id}_" covers every rendition: {id}_thumb.webp, {id}_display.webp,
        // and any variant a later build adds.
        foreach (var path in Matching(Path.Combine(tenantDirectory, DerivedDirectory), id + "_"))
        {
            Remove(path, ref files, ref bytes);
        }

        return Task.FromResult(new StoreDeletion(files, bytes));

        static void Remove(string path, ref int files, ref long bytes)
        {
            try
            {
                var size = new FileInfo(path).Length;
                File.Delete(path);
                files++;
                bytes += size;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Best effort. A file we could not unlink is still unreferenced;
                // the next sweep finds it again through EnumerateAsync.
            }
        }
    }

    /// <inheritdoc />
    public async IAsyncEnumerable<StoredObject> EnumerateAsync(
        [EnumeratorCancellation] CancellationToken ct)
    {
        if (!Directory.Exists(root))
        {
            yield break;
        }

        foreach (var tenantDirectory in Directory.EnumerateDirectories(root))
        {
            ct.ThrowIfCancellationRequested();

            // Only GUID-named directories are ours. Anything else in the root is
            // somebody else's and is never a candidate for deletion.
            if (!Guid.TryParseExact(Path.GetFileName(tenantDirectory), "D", out var tenantId))
            {
                continue;
            }

            foreach (var path in SafeEnumerateFiles(tenantDirectory))
            {
                ct.ThrowIfCancellationRequested();
                if (Classify(tenantId, path, derived: false) is { } original)
                {
                    yield return original;
                }
            }

            var derivedDirectory = Path.Combine(tenantDirectory, DerivedDirectory);
            foreach (var path in SafeEnumerateFiles(derivedDirectory))
            {
                ct.ThrowIfCancellationRequested();
                if (Classify(tenantId, path, derived: true) is { } rendition)
                {
                    yield return rendition;
                }
            }
        }

        await Task.CompletedTask;
    }

    /// <inheritdoc />
    /// <remarks>
    /// The handle is re-checked against the root before anything is unlinked.
    /// It can only have come from <see cref="EnumerateAsync"/>, but a delete is
    /// irreversible and the check costs one string comparison.
    /// </remarks>
    public Task<bool> DeleteObjectAsync(StoredObject stored, CancellationToken ct)
    {
        var rooted = Path.GetFullPath(root);
        var target = Path.GetFullPath(stored.Handle);
        if (!target.StartsWith(
                rooted.EndsWith(Path.DirectorySeparatorChar) ? rooted : rooted + Path.DirectorySeparatorChar,
                StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "Refusing to delete an object that does not live under the image storage root.");
        }

        try
        {
            if (!File.Exists(target))
            {
                return Task.FromResult(false);
            }

            File.Delete(target);
            return Task.FromResult(true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return Task.FromResult(false);
        }
    }

    /// <summary>
    /// Names a file we recognise, or null. Deliberately narrow: an unrecognised
    /// name is skipped rather than reported, so nothing the app did not write
    /// can ever become a delete candidate.
    /// </summary>
    private static StoredObject? Classify(Guid tenantId, string path, bool derived)
    {
        var name = Path.GetFileName(path);

        FileInfo info;
        try
        {
            info = new FileInfo(path);
            if (!info.Exists)
            {
                return null; // Raced with a delete between listing and stat.
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return null;
        }

        var stamp = new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero);

        if (name.EndsWith(".tmp", StringComparison.Ordinal))
        {
            // "{id}.{ext}.{n}.tmp" / "{id}_{variant}.webp.{n}.tmp" — always
            // prefixed with the image's id, because that is the only shape
            // WriteAtomicAsync produces. A .tmp without one is somebody else's
            // file that happens to share the extension, and it is skipped for
            // the same reason every other unrecognised name is: a candidate for
            // deletion has to be something this app wrote.
            return LeadingGuid(name) is { } stagingFor
                ? new StoredObject(tenantId, stagingFor, StoredObjectKind.Staging, stamp, info.Length, path)
                : null;
        }

        var stem = Path.GetFileNameWithoutExtension(name);
        if (derived)
        {
            var separator = stem.IndexOf('_', StringComparison.Ordinal);
            if (separator <= 0 || !Guid.TryParseExact(stem[..separator], "D", out var derivedOf))
            {
                return null;
            }

            return new StoredObject(tenantId, derivedOf, StoredObjectKind.Derived, stamp, info.Length, path);
        }

        return Guid.TryParseExact(stem, "D", out var imageId)
            ? new StoredObject(tenantId, imageId, StoredObjectKind.Original, stamp, info.Length, path)
            : null;
    }

    /// <summary>The 36-character GUID a staging name starts with, if it has one.</summary>
    private static Guid? LeadingGuid(string name) =>
        name.Length >= 36 && Guid.TryParseExact(name[..36], "D", out var id) ? id : null;

    /// <summary>
    /// Files whose name starts with <paramref name="prefix"/>. The pattern is
    /// only a pre-filter; the ordinal check is what decides, so platform
    /// differences in wildcard matching cannot widen the set.
    /// </summary>
    private static IEnumerable<string> Matching(string directory, string prefix)
    {
        if (!Directory.Exists(directory))
        {
            return [];
        }

        return SafeEnumerateFiles(directory, prefix + "*")
            .Where(path => Path.GetFileName(path).StartsWith(prefix, StringComparison.Ordinal))
            .ToArray();
    }

    private static string[] SafeEnumerateFiles(string directory, string pattern = "*")
    {
        try
        {
            return Directory.Exists(directory) ? Directory.GetFiles(directory, pattern) : [];
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return [];
        }
    }

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
