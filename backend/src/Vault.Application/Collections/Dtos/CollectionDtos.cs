namespace Vault.Application.Collections.Dtos;

// DTO shapes mirror the frontend's TypeScript interfaces 1:1 (camelCase via
// STJ). Enum-ish values travel as plain strings ("Mint", "Owner", "free") so
// the JSON matches the Angular models byte-for-byte.

public sealed record CustomFieldValueDto(string Key, string Value);

public sealed record GroupNodeDto(string Id, string Name, string? ParentId, IReadOnlyList<string> Fields);

public sealed record ItemDto(
    string Id,
    string Name,
    string Description,
    int Year,
    string Condition,
    decimal Value,
    decimal Price,
    string GroupId,
    IReadOnlyList<string> Tags,
    string Img,
    IReadOnlyList<CustomFieldValueDto> Custom,
    bool Owned,
    IReadOnlyList<Guid>? PhotoIds = null,
    DateTimeOffset? CreatedAt = null)
{
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
