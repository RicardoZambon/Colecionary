using Vault.Domain.Enums;

namespace Vault.Domain.ValueObjects;

/// <summary>A custom field declared by a group and inherited by its sub-groups.</summary>
public class GroupField
{
    public string Name { get; set; } = string.Empty;

    public GroupFieldType Type { get; set; } = GroupFieldType.Text;
}
