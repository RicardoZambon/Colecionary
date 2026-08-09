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
}
