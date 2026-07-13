using Vault.Application.Abstractions;

namespace Vault.Infrastructure.Persistence;

/// <summary>
/// Tenant identity for out-of-request scopes (seeding, `dotnet ef` design
/// time). Reports unauthenticated; tenant-scoped queries must use
/// <c>IgnoreQueryFilters()</c> in these scopes.
/// </summary>
public sealed class NoOpCurrentTenant : ICurrentTenant
{
    public static readonly NoOpCurrentTenant Instance = new();

    public bool IsAuthenticated => false;

    public Guid TenantId => Guid.Empty;

    public Guid UserId => Guid.Empty;

    public string Role => string.Empty;
}
