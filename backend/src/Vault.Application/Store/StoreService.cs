using Vault.Application.Abstractions;
using Vault.Application.Common;

namespace Vault.Application.Store;

public class StoreService(IStoreListingRepository storeListings)
{
    public async Task<List<StoreListingDto>> ListAsync(CancellationToken ct)
    {
        var listings = await storeListings.ListAsync(ct);
        return [.. listings.Select(l => l.ToDto())];
    }
}
