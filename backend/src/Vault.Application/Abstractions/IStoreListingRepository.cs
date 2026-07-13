using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

public interface IStoreListingRepository
{
    Task<List<StoreListing>> ListAsync(CancellationToken ct);

    Task<StoreListing?> GetAsync(string id, CancellationToken ct);
}
