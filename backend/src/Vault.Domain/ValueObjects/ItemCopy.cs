using Vault.Domain.Enums;

namespace Vault.Domain.ValueObjects;

/// <summary>
/// One physical copy of an item. Id is client-generated and stable so edits
/// target the right copy across a full-document PUT.
/// </summary>
public class ItemCopy
{
    public string Id { get; set; } = string.Empty;

    public Condition Condition { get; set; } = Condition.Good;

    /// <summary>What was actually paid for this copy, USD.</summary>
    public decimal Price { get; set; }

    /// <summary>Per-copy estimate. Null falls back to the item's reference Value.</summary>
    public decimal? Value { get; set; }

    public DateOnly? AcquiredOn { get; set; }

    public CopyStatus Status { get; set; } = CopyStatus.Keep;

    public string Notes { get; set; } = string.Empty;

    /// <summary>
    /// Values for the fields declared with <see cref="FieldScope.Copy"/>, keyed
    /// by field name exactly as an item's own <c>Custom</c> list is. This is what tells
    /// two otherwise identical copies apart — a slab number, a signature, a
    /// shelf — which the item-level list structurally cannot: it has one value
    /// where the collector has several.
    /// </summary>
    public List<CustomFieldValue> Custom { get; set; } = [];
}
