using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Domain.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence;

public class VaultDbContext(DbContextOptions<VaultDbContext> options, ICurrentTenant currentTenant)
    : DbContext(options)
{
    private readonly ICurrentTenant _currentTenant = currentTenant;

    /// <summary>
    /// Referenced by the global query filters. EF captures the context
    /// instance, so this re-evaluates per scope — each request sees only its
    /// own tenant's rows.
    /// </summary>
    public Guid CurrentTenantId => _currentTenant.TenantId;

    public DbSet<Tenant> Tenants => Set<Tenant>();

    public DbSet<User> Users => Set<User>();

    public DbSet<Collection> Collections => Set<Collection>();

    public DbSet<Group> Groups => Set<Group>();

    public DbSet<Item> Items => Set<Item>();

    public DbSet<CollectionMember> CollectionMembers => Set<CollectionMember>();

    public DbSet<StoreListing> StoreListings => Set<StoreListing>();

    public DbSet<StoredImage> Images => Set<StoredImage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(VaultDbContext).Assembly);

        // Tenant isolation by convention: every ITenantOwned entity gets
        // `e.TenantId == CurrentTenantId` as a global query filter. Entities
        // that are deliberately global (Tenant, StoreListing) don't implement
        // the interface.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes()
                     .Where(t => typeof(ITenantOwned).IsAssignableFrom(t.ClrType) && !t.IsOwned()))
        {
            var parameter = Expression.Parameter(entityType.ClrType, "e");
            var body = Expression.Equal(
                Expression.Property(parameter, nameof(ITenantOwned.TenantId)),
                Expression.Property(Expression.Constant(this), nameof(CurrentTenantId)));
            modelBuilder.Entity(entityType.ClrType).HasQueryFilter(Expression.Lambda(body, parameter));
        }
    }
}
