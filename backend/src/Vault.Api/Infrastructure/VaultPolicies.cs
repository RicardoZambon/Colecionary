namespace Vault.Api.Infrastructure;

/// <summary>
/// The authorization policies, named once so no controller spells a role list
/// by hand.
/// </summary>
/// <remarks>
/// <para>
/// Authentication was already deny-by-default (the fallback policy in
/// <c>Program</c>), but <em>authorization</em> was not: until this existed,
/// <c>[Authorize(Roles = …)]</c> appeared exactly twice in the whole API — on
/// the two tenant-administration endpoints — and nothing guarded a collection
/// or an item. A Viewer's token was accepted by every write in the application,
/// so the seeded read-only account could replace any collection document and
/// delete any item. <see cref="Application.Abstractions.ICurrentTenant.Role"/>
/// had been carried on the principal all along and read by nobody.
/// </para>
/// <para>
/// A named policy rather than a repeated role string: the membership of
/// "may write" is a single decision, and a role list copied into eleven
/// attributes is a list that will eventually disagree with itself. It also
/// keeps the roles out of the controllers, which is where the next role would
/// otherwise have to be added eleven times.
/// </para>
/// <para>
/// This is deliberately coarse — tenant-wide, not per-collection.
/// <c>CollectionMember.Role</c> exists and still authorises nothing; making a
/// per-collection share grant or withhold write access is a separate change
/// with its own query-filter consequences. Coarse and enforced beats fine and
/// imaginary.
/// </para>
/// </remarks>
public static class VaultPolicies
{
    /// <summary>
    /// May change catalogue content: collections, groups, sections, items,
    /// image bytes and framing.
    /// </summary>
    /// <remarks>
    /// Owner and Editor. A Viewer is refused with a 403 — the honest answer,
    /// and the one the client can act on, as opposed to the 200 it used to get.
    /// </remarks>
    public const string CanWrite = "vault:can-write";

    /// <summary>
    /// May change the account itself: membership, tenant settings, and
    /// restoring an archive over the top of existing collections.
    /// </summary>
    /// <remarks>
    /// Owner only. Archive import belongs here rather than under
    /// <see cref="CanWrite"/> because it is not an edit: it can overwrite every
    /// collection in the vault in one request, which is an account-scale act
    /// even though it arrives through a content-shaped endpoint.
    /// </remarks>
    public const string CanAdminister = "vault:can-administer";

    /// <summary>Roles allowed to write catalogue content.</summary>
    public static readonly string[] WriteRoles = ["Owner", "Editor"];

    /// <summary>Roles allowed to administer the account.</summary>
    public static readonly string[] AdminRoles = ["Owner"];
}
