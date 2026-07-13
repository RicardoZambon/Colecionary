using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

public interface IUserRepository
{
    /// <summary>Tenant-filtered lookup by email.</summary>
    Task<User?> GetByEmailAsync(string email, CancellationToken ct);

    /// <summary>
    /// Cross-tenant lookup for login (no tenant claim exists yet at that
    /// point). Implementations must use IgnoreQueryFilters.
    /// </summary>
    Task<User?> FindForLoginAsync(string email, CancellationToken ct);

    Task<User?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<List<User>> ListTenantMembersAsync(CancellationToken ct);

    void Add(User user);

    void Remove(User user);

    Task SaveChangesAsync(CancellationToken ct);
}
