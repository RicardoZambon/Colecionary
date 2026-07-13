namespace Vault.Application.Abstractions;

/// <summary>
/// Ambient tenant/user identity for the current scope. In the API this is
/// backed by JWT claims; seeding and design-time tooling use a no-op
/// implementation that reports <see cref="IsAuthenticated"/> = false.
/// </summary>
public interface ICurrentTenant
{
    bool IsAuthenticated { get; }

    /// <summary>Tenant of the authenticated caller. Throws when unauthenticated.</summary>
    Guid TenantId { get; }

    /// <summary>User id (JWT <c>sub</c>) of the authenticated caller. Throws when unauthenticated.</summary>
    Guid UserId { get; }

    /// <summary>Tenant role of the caller: Owner, Editor or Viewer.</summary>
    string Role { get; }
}
