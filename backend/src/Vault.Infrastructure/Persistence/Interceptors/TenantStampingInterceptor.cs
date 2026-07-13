using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Vault.Application.Abstractions;
using Vault.Domain.Abstractions;

namespace Vault.Infrastructure.Persistence.Interceptors;

/// <summary>
/// Stamps <c>TenantId</c> on new tenant-owned entities and rejects any write
/// that carries a foreign tenant id — belt and braces on top of the global
/// query filters and composite foreign keys.
/// </summary>
public sealed class TenantStampingInterceptor(ICurrentTenant currentTenant) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        Stamp(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Stamp(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void Stamp(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        foreach (var entry in context.ChangeTracker.Entries<ITenantOwned>())
        {
            if (entry.State == EntityState.Added && entry.Entity.TenantId == Guid.Empty)
            {
                if (!currentTenant.IsAuthenticated)
                {
                    throw new InvalidOperationException(
                        $"Cannot stamp TenantId on {entry.Metadata.DisplayName()}: no authenticated tenant in scope.");
                }

                entry.Entity.TenantId = currentTenant.TenantId;
            }
            else if (entry.State is EntityState.Added or EntityState.Modified
                     && currentTenant.IsAuthenticated
                     && entry.Entity.TenantId != currentTenant.TenantId)
            {
                throw new InvalidOperationException(
                    $"Cross-tenant write rejected for {entry.Metadata.DisplayName()}.");
            }
        }
    }
}
