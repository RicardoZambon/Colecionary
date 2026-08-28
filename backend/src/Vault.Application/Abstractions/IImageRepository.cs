using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

public interface IImageRepository
{
    void Add(StoredImage image);

    /// <summary>
    /// Unfiltered read: the GUID id acts as the capability for the anonymous
    /// image endpoint (browsers can't send Authorization on &lt;img&gt; loads).
    /// </summary>
    Task<StoredImage?> GetUnfilteredAsync(Guid id, CancellationToken ct);

    /// <summary>
    /// Tracked, tenant-filtered read for writes (framing).
    /// </summary>
    /// <remarks>
    /// Deliberately NOT <see cref="GetUnfilteredAsync"/>. Ignoring the filter is
    /// only defensible for the anonymous byte read, where the unguessable id is
    /// the capability and the worst case is serving bytes to whoever already
    /// holds the id. A write has no such excuse: routed through the unfiltered
    /// read, one tenant could reframe another tenant's image. Going through the
    /// global filter means a foreign id simply doesn't exist, so the caller gets
    /// a 404 and learns nothing.
    /// </remarks>
    Task<StoredImage?> GetForCurrentTenantAsync(Guid id, CancellationToken ct);

    /// <summary>
    /// Every image belonging to the current tenant, for the export archive.
    /// Tenant-filtered by the context's global query filter — deliberately NOT
    /// unfiltered, unlike <see cref="GetUnfilteredAsync"/>.
    /// </summary>
    Task<List<StoredImage>> ListForCurrentTenantAsync(CancellationToken ct);

    /// <summary>
    /// The subset of <paramref name="ids"/> the current tenant owns, for a
    /// single collection's export. Tenant-filtered like the overload above, so
    /// an id belonging to someone else simply doesn't come back — a collection
    /// referencing a foreign image exports without it rather than leaking it.
    /// </summary>
    Task<List<StoredImage>> ListForCurrentTenantAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken ct);

    Task SaveChangesAsync(CancellationToken ct);
}
