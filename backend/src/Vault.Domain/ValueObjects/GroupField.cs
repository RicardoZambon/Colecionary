using Vault.Domain.Enums;

namespace Vault.Domain.ValueObjects;

/// <summary>
/// A custom field declaration. Declared either by the collection — where it
/// applies to every item, whatever group it sits in — or by a group, where it
/// is inherited by that group's sub-groups.
/// </summary>
/// <remarks>
/// The name is the field's identity: it is the key of the value on the item or
/// the copy, and the tail of a "field:&lt;name&gt;" sort key. A declaration
/// deeper in the path therefore replaces an ancestor's entirely — its type and
/// its <see cref="Scope"/> both — rather than merging with it.
/// </remarks>
public class GroupField
{
    public string Name { get; set; } = string.Empty;

    public GroupFieldType Type { get; set; } = GroupFieldType.Text;

    /// <summary>
    /// Whether the value belongs to the item or to each of its copies. Defaults
    /// to <see cref="FieldScope.Item"/>, which is what every field declared
    /// before scopes existed is.
    /// </summary>
    public FieldScope Scope { get; set; } = FieldScope.Item;
}
