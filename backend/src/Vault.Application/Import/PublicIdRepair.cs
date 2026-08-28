using Vault.Application.Collections.Dtos;
using Vault.Application.Collections.Validators;

namespace Vault.Application.Import;

/// <summary>
/// Replaces ids inside an archived collection that this API would refuse, and
/// rewrites every reference to them.
/// </summary>
/// <remarks>
/// <para>
/// Group, item and copy ids must match <see cref="IdRules.PublicId"/>, but rows
/// predating that rule do not: the demo seed names a group <c>Pokémon</c> and a
/// Store checklist names one <c>Launch era</c>, both of which use the group's
/// display name as its id. Those collections exist in real vaults, so an import
/// that simply validated the archive would refuse to restore precisely the
/// backups most worth having.
/// </para>
/// <para>
/// The repair is deliberately minimal: an id that already passes is kept, so a
/// restore stays a restore, and only the ones that would be rejected are
/// replaced. Ids are internal handles — they appear in URLs, never on screen —
/// so a collection comes back looking identical, and it can then be edited,
/// which the original could not.
/// </para>
/// <para>
/// The collection's own id is not touched here: whether it can keep it depends
/// on what is already in the vault, which is <c>ImportService</c>'s decision.
/// </para>
/// </remarks>
public static class PublicIdRepair
{
    public static CollectionDto Apply(CollectionDto source)
    {
        var groupIds = source.Groups
            .Select(group => group.Id)
            .Distinct(StringComparer.Ordinal)
            .ToDictionary(id => id, id => Usable(id, "g"), StringComparer.Ordinal);

        return source with
        {
            Groups = [.. source.Groups.Select(group => group with
            {
                Id = groupIds[group.Id],
                // A parent that no longer exists is a dangling reference this
                // model tolerates — but only while it is *shaped* like an id.
                // One that is both dangling and malformed would fail validation,
                // so the group falls back to the root it already renders at.
                ParentId = group.ParentId is null
                    ? null
                    : groupIds.TryGetValue(group.ParentId, out var parent)
                        ? parent
                        : IdRules.PublicId().IsMatch(group.ParentId) ? group.ParentId : null,
            })],
            Items = [.. source.Items.Select(item => item with
            {
                Id = Usable(item.Id, "i"),
                // Not an id but a reference to one, and unconstrained in its own
                // right: "" is the ungrouped bucket and must survive untouched.
                GroupId = groupIds.GetValueOrDefault(item.GroupId, item.GroupId),
                Copies = [.. item.Copies.Select(copy => copy with { Id = Usable(copy.Id, "k") })],
            })],
        };
    }

    /// <summary>
    /// The id itself when the API would accept it, and a fresh one otherwise.
    /// The prefix only makes a generated id legible in a database dump; nothing
    /// reads it back.
    /// </summary>
    private static string Usable(string id, string prefix) =>
        IdRules.PublicId().IsMatch(id) ? id : $"{prefix}{Guid.NewGuid():N}"[..16];
}
