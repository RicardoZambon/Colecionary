using Vault.Domain.Enums;

namespace Vault.Application.Abstractions;

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
}
