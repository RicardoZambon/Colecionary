using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

/// <summary>
/// The account row itself. Separate from <see cref="IUserRepository"/> because a
/// tenant is not tenant-owned: it carries no <c>TenantId</c> and the global
/// query filter does not apply to it, so every read here is by explicit id.
/// </summary>
public interface ITenantRepository
{
    /// <summary>The tenant the current request is acting as, or null if it is gone.</summary>
    Task<Tenant?> GetAsync(Guid id, CancellationToken ct);

    Task SaveChangesAsync(CancellationToken ct);
}
