using Vault.Domain.Abstractions;

namespace Vault.Domain.Entities;

/// <summary>
/// A labelled run of items inside one group — a separator, not a level.
/// </summary>
/// <remarks>
/// <para>
/// Sections exist because a group pays for things a divider does not want. A
/// group is a destination: it appears in the tree and the breadcrumb, it turns
/// its parent's view into a dashboard of cards, it can declare fields and an
/// ordering, and it lists alphabetically because nothing persists a position
/// for one. Splitting "Espanha" into "Cavaleiros de Bronze / Prata / Ouro" with
/// sub-groups therefore buys three destinations nobody wanted to navigate to,
/// and loses the one thing that mattered: seeing them side by side, in that
/// order, in a single list.
/// </para>
/// <para>
/// So a section deliberately has no <c>ParentId</c> (the recursion already
/// exists on <see cref="Group"/>, and a nesting section would be that tree under
/// another name), no fields (they are taxonomy: a divider that changes the item
/// form's field set is the defect this fixes) and no sort (it is a run inside
/// <em>one</em> ordered list; per-run ordering would make the group's declared
/// order meaningless). What it does have, and a group does not, is
/// <see cref="SortOrder"/> — Bronze → Prata → Ouro is a progression, and
/// alphabetically that reads Bronze, Ouro, Prata.
/// </para>
/// <para>
/// <see cref="GroupId"/> is a plain string reference with no FK, exactly like
/// <see cref="Item.GroupId"/>, and may dangle. A section whose group is gone,
/// or an item pointing at a section belonging to some other group, resolves to
/// "no section" when read rather than failing a write: groups, sections and
/// items all arrive in the same document PUT, so cross-checking them here would
/// refuse legitimate intermediate states.
/// </para>
/// </remarks>
public class Section : ITenantOwned
{
    public Guid TenantId { get; set; }

    public string CollectionId { get; set; } = string.Empty;

    public string Id { get; set; } = string.Empty;

    /// <summary>The group whose items this section divides. Never empty.</summary>
    public string GroupId { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Declared size of the run this section stands for, so progress can be
    /// read per section — "Bronze 8/10" — and rolled up into the group the same
    /// way a child group's target is. Null means undeclared, and is distinct
    /// from any number for the reason spelled out on <see cref="Group.Target"/>.
    /// </summary>
    public int? Target { get; set; }

    /// <summary>
    /// Position among its group's sections. Unlike a group, a section persists
    /// one: it is a heading inside a list, and its order is the content's own.
    /// </summary>
    public int SortOrder { get; set; }
}
