using Vault.Domain.Abstractions;

namespace Vault.Domain.Entities;

/// <summary>
/// Aggregate root. Keyed by (TenantId, Id) where Id is the public string id —
/// client-generated or copied from a store listing, unique per tenant only.
/// </summary>
public class Collection : ITenantOwned
{
    public Guid TenantId { get; set; }

    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public bool LinkShare { get; set; } = true;

    /// <summary>
    /// ISO 4217 override for this collection's amounts. Null means the tenant's
    /// <see cref="Tenant.DefaultCurrency"/> decides — and null is the only way
    /// to say that, so it has to survive a round-trip. Copying the tenant's code
    /// down here instead would silently pin the collection the day the account
    /// default changed.
    /// </summary>
    public string? Currency { get; set; }

    public Guid? BannerImageId { get; set; }

    public Guid? IconImageId { get; set; }

    /// <summary>Server-controlled; collections list in creation order.</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    public List<Group> Groups { get; set; } = [];

    public List<Item> Items { get; set; } = [];

    public List<CollectionMember> Members { get; set; } = [];
}
