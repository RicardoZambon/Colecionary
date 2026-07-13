using System.Security.Claims;
using Vault.Application.Abstractions;

namespace Vault.Api.Infrastructure;

/// <summary>
/// Resolves the current tenant/user from the authenticated principal's JWT
/// claims. Outside a request (or unauthenticated) it reports
/// <see cref="IsAuthenticated"/> = false and identity accessors throw.
/// </summary>
public sealed class CurrentTenantFromHttpContext(IHttpContextAccessor accessor) : ICurrentTenant
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated =>
        Principal?.Identity?.IsAuthenticated == true
        && Principal.HasClaim(c => c.Type == VaultClaims.TenantId);

    public Guid TenantId =>
        Guid.TryParse(Principal?.FindFirstValue(VaultClaims.TenantId), out var tenantId)
            ? tenantId
            : throw new InvalidOperationException("No tenant in the current context.");

    public Guid UserId =>
        Guid.TryParse(Principal?.FindFirstValue(VaultClaims.Subject), out var userId)
            ? userId
            : throw new InvalidOperationException("No user in the current context.");

    public string Role => Principal?.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
}
