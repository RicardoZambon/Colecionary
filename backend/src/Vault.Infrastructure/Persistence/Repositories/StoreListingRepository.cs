using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Repositories;

public sealed class StoreListingRepository(VaultDbContext db) : IStoreListingRepository
{
    public Task<List<StoreListing>> ListAsync(CancellationToken ct) =>
        db.StoreListings.AsNoTracking().OrderBy(l => l.Name).ToListAsync(ct);

    public Task<StoreListing?> GetAsync(string id, CancellationToken ct) =>
        db.StoreListings.AsNoTracking().FirstOrDefaultAsync(l => l.Id == id, ct);
}
