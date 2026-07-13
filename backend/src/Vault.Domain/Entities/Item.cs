using Vault.Domain.Abstractions;
using Vault.Domain.Enums;
using Vault.Domain.ValueObjects;

namespace Vault.Domain.Entities;

/// <summary>
/// A collected (or wanted) item. Id is client-generated. GroupId is a plain
/// string that may dangle when groups are edited — mirrors the frontend model.
/// </summary>
public class Item : ITenantOwned
{
    public Guid TenantId { get; set; }

    public string CollectionId { get; set; } = string.Empty;

    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public int Year { get; set; }

    public Condition Condition { get; set; } = Condition.Good;

    /// <summary>Estimated market value, USD.</summary>
    public decimal Value { get; set; }

    /// <summary>Purchase price, USD. 0 for wanted items.</summary>
    public decimal Price { get; set; }

    public string GroupId { get; set; } = string.Empty;

    public List<string> Tags { get; set; } = [];

    public string Img { get; set; } = string.Empty;

    public List<CustomFieldValue> Custom { get; set; } = [];

    /// <summary>False = on the wantlist, not in the vault yet.</summary>
    public bool Owned { get; set; } = true;

    public int SortOrder { get; set; }

    /// <summary>Uploaded photo ids, ordered — the first one is the cover.</summary>
    public List<Guid> PhotoIds { get; set; } = [];

    /// <summary>Server-controlled; drives "recent additions" and weekly stats.</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }
}
