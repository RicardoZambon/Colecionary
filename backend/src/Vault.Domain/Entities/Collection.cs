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

    /// <summary>
    /// Optimistic concurrency token for the <b>whole aggregate</b> — this row
    /// and every group, item and member under it.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The collection PUT replaces the entire document, so two clients that both
    /// read version <i>n</i> and both write would leave the second one silently
    /// erasing the first: <c>MergeByKey</c> deletes any child the payload does
    /// not carry. This column is what makes the second write fail instead. It is
    /// configured with <c>IsConcurrencyToken()</c>, so every UPDATE of this row
    /// carries <c>AND Version = @original</c> and affects zero rows once someone
    /// else has moved it on.
    /// </para>
    /// <para>
    /// It counts changes to the aggregate, not to this row: an item edit writes
    /// no column here, yet a client that has not seen that edit must not be
    /// allowed to PUT the whole document over it. <c>CollectionVersionInterceptor</c>
    /// therefore advances this value whenever <em>any</em> entity under the
    /// collection is added, changed or removed — which is also why it is a plain
    /// counter and not a SQL <c>rowversion</c>, since a rowversion only moves
    /// when the row it lives on is itself updated.
    /// </para>
    /// <para>
    /// Rows written before the column existed start at 1. The number is never
    /// shown to a user and never travels as a number: it reaches the client as an
    /// opaque HTTP entity-tag (see <c>CollectionVersions</c>).
    /// </para>
    /// </remarks>
    public int Version { get; set; } = 1;

    public List<Group> Groups { get; set; } = [];

    public List<Item> Items { get; set; } = [];

    public List<CollectionMember> Members { get; set; } = [];
}
