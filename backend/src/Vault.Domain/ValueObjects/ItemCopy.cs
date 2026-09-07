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
    /// <remarks>
    /// Reads as an empty list when the stored document carries no
    /// <c>Custom</c> array — the shape of every copy written before field
    /// scopes existed, and of every copy an older build writes after the
    /// migration has run. A property initialiser does not cover it: EF
    /// materialises an owned collection by assigning it, so an absent nested
    /// array arrives as null long after the initialiser ran, and the guard has
    /// to sit in the getter because EF may write the backing field directly.
    /// <para>
    /// The consequence of not having it is out of all proportion to the cause:
    /// <c>copy.Custom.Select(...)</c> throws while mapping, and since the whole
    /// vault is mapped in one request, <b>one</b> copy in the old shape makes
    /// <c>GET /api/collections</c> answer 500 for every collection the account
    /// has. The migration repairs the rows that existed when it ran; this is
    /// what keeps a row it never saw from taking the account down, and it lets
    /// the next save rewrite that row in the current shape.
    /// </para>
    /// </remarks>
    public List<CustomFieldValue> Custom
    {
        get => custom ??= [];
        set => custom = value;
    }

    private List<CustomFieldValue>? custom = [];
}
