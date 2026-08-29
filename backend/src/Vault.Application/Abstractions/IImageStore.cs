using Vault.Domain.Enums;

namespace Vault.Application.Abstractions;

/// <summary>What an object in the store is, and therefore what losing it costs.</summary>
public enum StoredObjectKind
{
    /// <summary>The bytes as uploaded. The only irreplaceable file an image has.</summary>
    Original,

    /// <summary>A cached rendition. Regenerable on demand from the original.</summary>
    Derived,

    /// <summary>
    /// A staging file left behind by a write that never completed its move.
    /// Holds no reachable data — nothing names it.
    /// </summary>
    Staging,
}

/// <summary>
/// One object the store holds, as the garbage collector sees it.
/// </summary>
/// <param name="TenantId">
/// The tenant whose partition holds it. Read from the storage layout, never
/// from an ambient request — the same image id under two tenants is two
/// different pictures.
/// </param>
/// <param name="ImageId">
/// The image it belongs to, or null when the name cannot be attributed to one
/// (a staging file whose prefix is unreadable).
/// </param>
/// <param name="Kind">See <see cref="StoredObjectKind"/>.</param>
/// <param name="LastWrittenUtc">
/// When the bytes were last written. The only clock available for an object
/// that has no database row, so it is what a grace period has to run on.
/// </param>
/// <param name="SizeBytes">Size on disk, for reporting how much a sweep would free.</param>
/// <param name="Handle">
/// Opaque, store-specific locator, only ever produced by
/// <see cref="IImageStore.EnumerateAsync"/> and only ever consumed by
/// <see cref="IImageStore.DeleteObjectAsync"/>. Implementations must validate
/// that a handle addresses something inside their own storage.
/// </param>
public sealed record StoredObject(
    Guid TenantId,
    Guid? ImageId,
    StoredObjectKind Kind,
    DateTimeOffset LastWrittenUtc,
    long SizeBytes,
    string Handle);

/// <summary>How much a delete actually removed.</summary>
public sealed record StoreDeletion(int Files, long Bytes)
{
    public static readonly StoreDeletion None = new(0, 0);
}

/// <summary>
/// Where uploaded image bytes physically live. The database keeps only the
/// metadata row — which tenant owns an id, and what content type it is — so the
/// bytes can move (local disk today, object storage later) without touching the
/// schema or the API contract.
/// </summary>
/// <remarks>
/// Every operation is scoped by <c>tenantId</c>: implementations must keep one
/// tenant's bytes physically separate from another's, and callers must pass the
/// tenant id read from the image's own row rather than the caller's ambient
/// tenant. That is what makes the anonymous GUID-capability read endpoint safe —
/// a guessed id can only ever resolve inside its own tenant's storage.
/// </remarks>
public interface IImageStore
{
    Task SaveAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        ReadOnlyMemory<byte> data,
        CancellationToken ct);

    /// <summary>
    /// Opens the stored bytes, or returns null when the metadata row exists but
    /// its bytes don't — a torn upload, or a database restored without its
    /// image directory. Callers surface that as a 404 rather than a 500.
    /// </summary>
    Task<Stream?> OpenReadAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        CancellationToken ct);

    /// <summary>
    /// Reads the whole original into memory. Only the deriver wants this — it
    /// has to decode the bytes anyway — which is why the streaming read above
    /// stays the normal path for serving.
    /// </summary>
    Task<byte[]?> ReadAllAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        CancellationToken ct);

    /// <summary>
    /// Stores a resized copy beside the original, under a name derived from the
    /// variant.
    /// </summary>
    /// <remarks>
    /// Derived files live in their own sub-directory rather than alongside the
    /// originals, so "every original this tenant owns" stays a plain directory
    /// listing. That is what lets the export keep working without knowing
    /// variants exist, and what makes a derived cache safe to delete wholesale:
    /// nothing in it is the only copy of anything.
    /// </remarks>
    Task SaveDerivedAsync(
        Guid tenantId,
        Guid imageId,
        ImageVariant variant,
        string contentType,
        ReadOnlyMemory<byte> data,
        CancellationToken ct);

    /// <summary>
    /// Opens a previously derived copy, or null if it has not been generated
    /// yet — which is the normal state for every image uploaded before variants
    /// existed, and for every image restored from an archive.
    /// </summary>
    Task<Stream?> OpenDerivedAsync(
        Guid tenantId,
        Guid imageId,
        ImageVariant variant,
        string contentType,
        CancellationToken ct);

    /// <summary>
    /// Removes every byte belonging to one image: the original <em>and</em>
    /// every cached rendition of it. Idempotent — deleting an image that is
    /// already gone is a no-op, not an error.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Deleting the original without its renditions would move the leak rather
    /// than fix it: the cache entries are named after the id and nothing would
    /// ever look at them again. Implementations must therefore find renditions
    /// by the id's own prefix rather than by reconstructing each variant's
    /// name from <paramref name="contentType"/> — a rendition is re-encoded
    /// (WebP today) and does not share the original's extension.
    /// </para>
    /// <para>
    /// <paramref name="tenantId"/> must come from the image's own metadata row.
    /// Passing the ambient request tenant would let a sweep in one tenant
    /// address another tenant's partition.
    /// </para>
    /// </remarks>
    Task<StoreDeletion> DeleteAsync(
        Guid tenantId,
        Guid imageId,
        string contentType,
        CancellationToken ct);

    /// <summary>
    /// Every object the store holds that it can attribute to a tenant, so bytes
    /// whose metadata row never landed can be found at all.
    /// </summary>
    /// <remarks>
    /// Uploads write the bytes before the row, so a crash in between leaves a
    /// file no database query can ever see. Enumerating storage is the only way
    /// to find those. Implementations must skip anything they cannot classify:
    /// an unrecognised name is not a candidate for deletion, it is a thing
    /// somebody else put there.
    /// </remarks>
    IAsyncEnumerable<StoredObject> EnumerateAsync(CancellationToken ct);

    /// <summary>
    /// Removes one object previously returned by <see cref="EnumerateAsync"/>.
    /// Returns false when it had already gone.
    /// </summary>
    Task<bool> DeleteObjectAsync(StoredObject stored, CancellationToken ct);
}
