using Vault.Domain.ValueObjects;

namespace Vault.Domain.Entities;

/// <summary>
/// Curated checklist in the Collection Store. Global catalog data — NOT
/// tenant-scoped and never mutated by tenants.
/// </summary>
public class StoreListing
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Publisher { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public List<string> Groups { get; set; } = [];

    public List<StoreListingItem> Items { get; set; } = [];
}
