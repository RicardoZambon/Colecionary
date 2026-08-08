using Vault.Domain.Abstractions;
using Vault.Domain.ValueObjects;

namespace Vault.Domain.Entities;

/// <summary>
/// A catalogued item. Id is client-generated. GroupId is a plain string that may
/// dangle when groups are edited — mirrors the frontend model. Ownership is not
/// a field: an item with at least one copy is owned, one with none is wanted.
/// </summary>
public class Item : ITenantOwned
{
    public Guid TenantId { get; set; }

    public string CollectionId { get; set; } = string.Empty;

    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public int Year { get; set; }

    /// <summary>Per-unit reference estimate, USD. A copy's own Value overrides it.</summary>
    public decimal Value { get; set; }

    public string GroupId { get; set; } = string.Empty;

    public List<string> Tags { get; set; } = [];

    public string Img { get; set; } = string.Empty;

    public List<CustomFieldValue> Custom { get; set; } = [];

    /// <summary>Physical copies owned. Empty = on the wantlist, not in the vault yet.</summary>
    public List<ItemCopy> Copies { get; set; } = [];

    public int SortOrder { get; set; }

    /// <summary>Uploaded photo ids, ordered — the first one is the cover.</summary>
    public List<Guid> PhotoIds { get; set; } = [];

    /// <summary>Server-controlled; drives "recent additions" and weekly stats.</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }
}
