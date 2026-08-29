namespace Vault.Application.Profile;

/// <summary>
/// Mirrors the frontend's <c>UserProfile</c>: plan is "free" | "pro", role is
/// "Owner" | "Editor" | "Viewer".
/// </summary>
/// <remarks>
/// <para>
/// The role is here because the client has to be able to stop offering what the
/// server will refuse. Once every write endpoint carries a policy, a Viewer
/// pressing "Add item" earns a 403 — correct, and a worse experience than the
/// button not being there at all. The claim was already in the JWT and read by
/// nobody on the client; decoding a token in the browser to recover it would be
/// a parser to maintain for a value the profile can simply state.
/// </para>
/// <para>
/// <b>Read-only.</b> <c>ProfileService.UpdateAsync</c> ignores it, exactly as it
/// refuses a changed email. A client that could PUT its own role would be the
/// self-assigned-plan mistake again, this time with consequences.
/// </para>
/// </remarks>
public sealed record UserProfileDto(string Name, string Email, string Initials, string Plan, string Role);
