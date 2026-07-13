using Vault.Domain.Abstractions;

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

    public List<string> Fields { get; set; } = [];

    /// <summary>Preserves the frontend's array ordering.</summary>
    public int SortOrder { get; set; }
}
