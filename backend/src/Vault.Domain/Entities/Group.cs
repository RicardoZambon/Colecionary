using Vault.Domain.Abstractions;
using Vault.Domain.ValueObjects;

namespace Vault.Domain.Entities;

/// <summary>
/// Node in a collection's group tree. ParentId is a plain string reference
/// within the same collection (no FK — trees are replaced wholesale).
/// </summary>
public class Group : ITenantOwned
{
    public Guid TenantId { get; set; }

    public string CollectionId { get; set; } = string.Empty;

    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? ParentId { get; set; }

    public List<GroupField> Fields { get; set; } = [];

    /// <summary>
    /// Default ordering for the items in this group, as a built-in key
    /// ("manual", "added", "name", "value", "year") or "field:&lt;field name&gt;".
    /// Null means the nearest ancestor that sets one decides.
    /// </summary>
    public string? SortBy { get; set; }

    /// <summary>"asc" or "desc". Only meaningful alongside <see cref="SortBy"/>.</summary>
    public string? SortDirection { get; set; }

    /// <summary>Preserves the frontend's array ordering.</summary>
    public int SortOrder { get; set; }
}
