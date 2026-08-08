using Vault.Application.Collections.Dtos;
using Vault.Application.Profile;
using Vault.Application.Store;
using Vault.Domain.Entities;
using Vault.Domain.Enums;
using Vault.Domain.ValueObjects;

namespace Vault.Application.Common;

/// <summary>Hand-written entity ↔ DTO mapping. No reflection magic.</summary>
public static class DtoMapper
{
    public static CollectionDto ToDto(this Collection collection) => new(
        collection.Id,
        collection.Name,
        collection.Description,
        [.. collection.Groups.OrderBy(g => g.SortOrder).Select(ToDto)],
        [.. collection.Items.OrderBy(i => i.SortOrder).Select(ToDto)],
        [.. collection.Members.Select(ToDto)],
        collection.LinkShare,
        collection.BannerImageId,
        collection.IconImageId);

    public static GroupNodeDto ToDto(this Group group) =>
        new(group.Id, group.Name, group.ParentId, group.Fields);

    public static ItemDto ToDto(this Item item) => new(
        item.Id,
        item.Name,
        item.Description,
        item.Year,
        item.Value,
        item.GroupId,
        item.Tags,
        item.Img,
        [.. item.Custom.Select(c => new CustomFieldValueDto(c.Key, c.Value))],
        [.. item.Copies.Select(ToDto)],
        item.PhotoIds,
        item.CreatedAtUtc);

    public static ItemCopyDto ToDto(this ItemCopy copy) => new(
        copy.Id,
        copy.Condition.ToString(),
        copy.Price,
        copy.Value,
        copy.AcquiredOn,
        copy.Status.ToString(),
        copy.Notes);

    public static MemberDto ToDto(this CollectionMember member) =>
        new(member.Name, member.Email, member.Initials, member.Role.ToString());

    public static MemberDto ToMemberDto(this User user) =>
        new(user.Name, user.Email, user.Initials, user.Role.ToString());

    public static UserProfileDto ToProfileDto(this User user) =>
        new(user.Name, user.Email, user.Initials, user.Plan.ToString().ToLowerInvariant());

    public static StoreListingDto ToDto(this StoreListing listing) => new(
        listing.Id,
        listing.Name,
        listing.Publisher,
        listing.Description,
        listing.Groups,
        [.. listing.Items.Select(i => new StoreListingItemDto(i.Id, i.Name, i.Year, i.Value, i.Group, i.Img))]);

    // --- DTO → entity ---

    public static Group ToEntity(this GroupNodeDto dto, string collectionId, Guid tenantId, int sortOrder) => new()
    {
        TenantId = tenantId,
        CollectionId = collectionId,
        Id = dto.Id,
        Name = dto.Name,
        ParentId = dto.ParentId,
        Fields = [.. dto.Fields],
        SortOrder = sortOrder,
    };

    public static Item ToEntity(this ItemDto dto, string collectionId, Guid tenantId, int sortOrder, DateTimeOffset createdAtUtc) => new()
    {
        TenantId = tenantId,
        CollectionId = collectionId,
        Id = dto.Id,
        Name = dto.Name,
        Description = dto.Description,
        Year = dto.Year,
        Value = dto.Value,
        GroupId = dto.GroupId,
        Tags = [.. dto.Tags],
        Img = dto.Img,
        Custom = [.. dto.Custom.Select(c => new CustomFieldValue { Key = c.Key, Value = c.Value })],
        Copies = [.. dto.Copies.Select(ToEntity)],
        SortOrder = sortOrder,
        PhotoIds = [.. dto.PhotoIds],
        // Server-controlled: client-provided createdAt is ignored.
        CreatedAtUtc = createdAtUtc,
    };

    public static ItemCopy ToEntity(this ItemCopyDto dto) => new()
    {
        Id = dto.Id,
        Condition = ParseCondition(dto.Condition),
        Price = dto.Price,
        Value = dto.Value,
        AcquiredOn = dto.AcquiredOn,
        Status = ParseCopyStatus(dto.Status),
        Notes = dto.Notes,
    };

    public static CollectionMember ToEntity(this MemberDto dto, string collectionId, Guid tenantId) => new()
    {
        TenantId = tenantId,
        CollectionId = collectionId,
        Email = dto.Email,
        Name = dto.Name,
        Initials = dto.Initials,
        Role = ParseRole(dto.Role),
    };

    public static void ApplyTo(this ItemDto dto, Item item)
    {
        item.Name = dto.Name;
        item.Description = dto.Description;
        item.Year = dto.Year;
        item.Value = dto.Value;
        item.GroupId = dto.GroupId;
        item.Tags = [.. dto.Tags];
        item.Img = dto.Img;
        item.Custom = [.. dto.Custom.Select(c => new CustomFieldValue { Key = c.Key, Value = c.Value })];
        item.Copies = [.. dto.Copies.Select(ToEntity)];
        item.PhotoIds = [.. dto.PhotoIds];
        // CreatedAtUtc deliberately untouched — server-controlled.
    }

    public static Condition ParseCondition(string value) =>
        Enum.TryParse<Condition>(value, ignoreCase: true, out var parsed)
            ? parsed
            : throw new DomainRuleException($"Unknown condition '{value}'.");

    public static CopyStatus ParseCopyStatus(string value) =>
        Enum.TryParse<CopyStatus>(value, ignoreCase: true, out var parsed)
            ? parsed
            : throw new DomainRuleException($"Unknown copy status '{value}'.");

    public static MemberRole ParseRole(string value) =>
        Enum.TryParse<MemberRole>(value, ignoreCase: true, out var parsed)
            ? parsed
            : throw new DomainRuleException($"Unknown role '{value}'.");

    public static PlanId ParsePlan(string value) =>
        Enum.TryParse<PlanId>(value, ignoreCase: true, out var parsed)
            ? parsed
            : throw new DomainRuleException($"Unknown plan '{value}'.");
}
