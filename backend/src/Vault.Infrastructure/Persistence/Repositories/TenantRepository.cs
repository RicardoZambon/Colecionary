using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Repositories;

public sealed class TenantRepository(VaultDbContext db) : ITenantRepository
{
    public Task<Tenant?> GetAsync(Guid id, CancellationToken ct) =>
        // No IgnoreQueryFilters needed: Tenants is not an ITenantOwned set, so
        // no filter is applied to it. The id comes from the caller's own claim.
        db.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);

    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
}
