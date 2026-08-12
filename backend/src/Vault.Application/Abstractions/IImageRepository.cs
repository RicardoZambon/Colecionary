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
    /// Every image belonging to the current tenant, for the export archive.
    /// Tenant-filtered by the context's global query filter — deliberately NOT
    /// unfiltered, unlike <see cref="GetUnfilteredAsync"/>.
    /// </summary>
    Task<List<StoredImage>> ListForCurrentTenantAsync(CancellationToken ct);

    Task SaveChangesAsync(CancellationToken ct);
}
