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

    Task SaveChangesAsync(CancellationToken ct);
}
