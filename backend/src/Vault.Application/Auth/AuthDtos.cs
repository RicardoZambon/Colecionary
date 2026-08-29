using Vault.Application.Profile;

namespace Vault.Application.Auth;

public sealed record LoginRequest(string Email, string Password);

public sealed record LoginResponse(string Token, DateTimeOffset ExpiresAt, UserProfileDto Profile);

/// <summary>How a sign-in attempt ended. The controller maps each to a status code.</summary>
public enum LoginOutcome
{
    /// <summary>Credentials verified; a token was issued.</summary>
    Success,

    /// <summary>Wrong password, or no such user. Deliberately one outcome, not two.</summary>
    InvalidCredentials,

    /// <summary>Refused before the password was checked — too many recent failures.</summary>
    Throttled,
}

/// <summary>
/// The result of <see cref="AuthService.LoginAsync"/>.
/// </summary>
/// <remarks>
/// Replaces the old nullable <see cref="LoginResponse"/>: "no response" now has
/// two meanings that must reach the client as different status codes (401 vs
/// 429), and a null can only carry one of them.
/// </remarks>
/// <param name="Outcome">Which of the three things happened.</param>
/// <param name="Response">The issued token, on success only.</param>
/// <param name="RetryAfter">How long the caller must wait, when throttled.</param>
public sealed record LoginResult(LoginOutcome Outcome, LoginResponse? Response, TimeSpan RetryAfter)
{
    /// <summary>Credentials verified.</summary>
    public static LoginResult Ok(LoginResponse response) =>
        new(LoginOutcome.Success, response, TimeSpan.Zero);

    /// <summary>Credentials rejected.</summary>
    public static LoginResult Rejected { get; } =
        new(LoginOutcome.InvalidCredentials, null, TimeSpan.Zero);

    /// <summary>Refused by the throttle.</summary>
    public static LoginResult Throttled(TimeSpan retryAfter) =>
        new(LoginOutcome.Throttled, null, retryAfter);
}
