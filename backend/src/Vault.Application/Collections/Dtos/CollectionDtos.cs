namespace Vault.Application.Collections.Dtos;

// DTO shapes mirror the frontend's TypeScript interfaces 1:1 (camelCase via
// STJ). Enum-ish values travel as plain strings ("Mint", "Owner", "free") so
// the JSON matches the Angular models byte-for-byte.

public sealed record CustomFieldValueDto(string Key, string Value);

public sealed record GroupFieldDto(string Name, string Type);

/// <summary>
/// A group's default ordering. By is a built-in key ("manual", "added",
/// "name", "value", "year") or "field:&lt;field name&gt;".
/// </summary>
public sealed record GroupSortDto(string By, string Direction);

/// <summary>
/// A null Sort means the nearest ancestor that sets one decides. A null Target
/// means no series size was declared, so progress is measured against what is
/// catalogued; keep the null, it is what tells "undeclared" from any number.
/// </summary>
public sealed record GroupNodeDto(
    string Id,
    string Name,
    string? ParentId,
    IReadOnlyList<GroupFieldDto> Fields,
    GroupSortDto? Sort = null,
    int? Target = null);

/// <summary>One physical copy. A null Value means "use the item's Value".</summary>
public sealed record ItemCopyDto(
    string Id,
    string Condition,
    decimal Price,
    decimal? Value = null,
    DateOnly? AcquiredOn = null,
    string? Status = null,
    string? Notes = null)
{
    public string Status { get; init; } = Status ?? "Keep";

    public string Notes { get; init; } = Notes ?? string.Empty;
}

/// <summary>
/// Ownership is derived, not transported: an item with copies is owned, one
/// without is on the wantlist. There is deliberately no `owned` field — this
/// DTO round-trips GET → PUT, and a field the server computes but ignores on
/// input desynchronises silently.
/// </summary>
public sealed record ItemDto(
    string Id,
    string Name,
    string Description,
    int Year,
    decimal Value,
    string GroupId,
    IReadOnlyList<string> Tags,
    string Img,
    IReadOnlyList<CustomFieldValueDto> Custom,
    IReadOnlyList<ItemCopyDto>? Copies = null,
    IReadOnlyList<Guid>? PhotoIds = null,
    DateTimeOffset? CreatedAt = null)
{
    public IReadOnlyList<ItemCopyDto> Copies { get; init; } = Copies ?? [];

    public IReadOnlyList<Guid> PhotoIds { get; init; } = PhotoIds ?? [];
}

public sealed record MemberDto(string Name, string Email, string Initials, string Role);

/// <summary>
/// A null Currency means the account default applies. Keep the null — it is the
/// only way to say "follow the account", and resolving it to a code here would
/// turn every GET → PUT round-trip into a silent per-collection pin.
/// </summary>
public sealed record CollectionDto(
    string Id,
    string Name,
    string Description,
    IReadOnlyList<GroupNodeDto> Groups,
    IReadOnlyList<ItemDto> Items,
    IReadOnlyList<MemberDto> Members,
    bool LinkShare,
    Guid? BannerImageId = null,
    Guid? IconImageId = null,
    string? Currency = null);

public sealed record CreateCollectionRequest(string Name, string Description);

/// <summary>
/// A collection paired with the version token a write of it must quote back.
/// </summary>
/// <param name="Version">
/// The collection's current HTTP entity-tag, quotes included — exactly the value
/// to put in an <c>If-Match</c> header. Opaque: the client never parses it.
/// </param>
/// <param name="Collection">The document itself, unchanged.</param>
/// <remarks>
/// <para>
/// The version rides in an envelope beside <see cref="CollectionDto"/> rather
/// than inside it, for two reasons that both matter. <see cref="CollectionDto"/>
/// <em>is</em> the archive format — an entry in an export is byte-for-byte what
/// <c>GET /api/collections</c> returns — and a concurrency token has no business
/// in a backup. And the frontend's <c>Collection</c> model stays untouched,
/// which is what the "the API contract mirrors VaultApi" rule protects.
/// </para>
/// <para>
/// It exists at all because a single-resource <c>ETag</c> header cannot carry a
/// version <em>per element</em> of a list, and the list is where this client
/// synchronises: a token fetched at any other moment would describe a document
/// the payload was not derived from, which is the one thing a precondition must
/// never do.
/// </para>
/// </remarks>
public sealed record VersionedCollectionDto(string Version, CollectionDto Collection);

/// <summary>An item and the version its collection is now at.</summary>
/// <remarks>
/// An item write moves the whole aggregate's version (see
/// <c>CollectionVersionInterceptor</c>), so the caller has to be told the new
/// one or its next write would quote a token that is already stale.
/// </remarks>
public sealed record VersionedItemDto(string Version, ItemDto Item);
