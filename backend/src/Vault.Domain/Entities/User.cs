using Vault.Domain.Abstractions;
using Vault.Domain.Enums;

namespace Vault.Domain.Entities;

public class User : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public string Email { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Initials { get; set; } = string.Empty;

    public MemberRole Role { get; set; } = MemberRole.Viewer;

    public PlanId Plan { get; set; } = PlanId.Free;

    /// <summary>Null for invited members that have not set a password yet.</summary>
    public string? PasswordHash { get; set; }
}
