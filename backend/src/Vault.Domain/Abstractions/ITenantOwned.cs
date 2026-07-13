namespace Vault.Domain.Abstractions;

/// <summary>
/// Marks an entity as belonging to a tenant. Every implementer is covered by
/// the global query filter in <c>VaultDbContext</c> and stamped by the
/// <c>TenantStampingInterceptor</c> on insert.
/// </summary>
public interface ITenantOwned
{
    Guid TenantId { get; set; }
}
