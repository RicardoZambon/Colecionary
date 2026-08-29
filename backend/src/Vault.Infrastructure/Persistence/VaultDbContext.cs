using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Application.Common;
using Vault.Application.Resources;
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

    public DbSet<Section> Sections => Set<Section>();

    public DbSet<Item> Items => Set<Item>();

    public DbSet<CollectionMember> CollectionMembers => Set<CollectionMember>();

    public DbSet<StoreListing> StoreListings => Set<StoreListing>();

    public DbSet<StoredImage> Images => Set<StoredImage>();

    /// <summary>
    /// Saves, turning a lost concurrency race into the refusal the API answers
    /// with rather than an unhandled EF exception.
    /// </summary>
    /// <remarks>
    /// <para>
    /// It sits here, on the context, rather than in one repository because every
    /// repository in a request shares this instance: <c>ImportService</c>
    /// deliberately commits the collection graph through
    /// <c>IImageRepository.SaveChangesAsync</c>, so a translation living only in
    /// <c>CollectionRepository</c> would let exactly that path answer 500 where
    /// every other path answers 412.
    /// </para>
    /// <para>
    /// <see cref="Collection.Version"/> is the only concurrency token in the
    /// model, which is what makes the single message accurate. A second token
    /// would need this to say which aggregate lost.
    /// </para>
    /// <para>
    /// EF wraps a multi-statement <c>SaveChanges</c> in a transaction, so the
    /// loser's child inserts, updates and deletes roll back with the guarded
    /// UPDATE of the root — the document is left byte-identical, not half
    /// written. <c>OptimisticConcurrencyTests</c> pins that end to end.
    /// </para>
    /// </remarks>
    public override async Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
        }
        catch (DbUpdateConcurrencyException e)
        {
            throw new PreconditionFailedException(Messages.CollectionChangedElsewhere, e);
        }
    }

    /// <inheritdoc cref="SaveChangesAsync(bool, CancellationToken)"/>
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        try
        {
            return base.SaveChanges(acceptAllChangesOnSuccess);
        }
        catch (DbUpdateConcurrencyException e)
        {
            throw new PreconditionFailedException(Messages.CollectionChangedElsewhere, e);
        }
    }

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
