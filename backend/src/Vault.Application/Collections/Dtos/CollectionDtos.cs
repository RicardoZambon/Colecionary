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

/// <summary>A null Sort means the nearest ancestor that sets one decides.</summary>
public sealed record GroupNodeDto(
    string Id,
    string Name,
    string? ParentId,
    IReadOnlyList<GroupFieldDto> Fields,
    GroupSortDto? Sort = null);

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

public sealed record CollectionDto(
    string Id,
    string Name,
    string Description,
    IReadOnlyList<GroupNodeDto> Groups,
    IReadOnlyList<ItemDto> Items,
    IReadOnlyList<MemberDto> Members,
    bool LinkShare,
    Guid? BannerImageId = null,
    Guid? IconImageId = null);

public sealed record CreateCollectionRequest(string Name, string Description);
