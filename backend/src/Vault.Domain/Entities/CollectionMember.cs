using Vault.Domain.Abstractions;
using Vault.Domain.Enums;

namespace Vault.Domain.Entities;

/// <summary>
/// Denormalized per-collection share entry (value-object semantics matching
/// the frontend's Member shape). Keyed by (TenantId, CollectionId, Email).
/// </summary>
public class CollectionMember : ITenantOwned
{
    public Guid TenantId { get; set; }

    public string CollectionId { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Initials { get; set; } = string.Empty;

    public MemberRole Role { get; set; } = MemberRole.Viewer;
}
