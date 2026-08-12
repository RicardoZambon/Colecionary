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
}
