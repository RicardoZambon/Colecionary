using System.Globalization;
using System.Text;
using Vault.Application.Abstractions;
using Vault.Application.Common;

namespace Vault.Application.Auth;

public class AuthService(
    IUserRepository users,
    IPasswordService passwords,
    IJwtTokenService tokens,
    ILoginAttemptTracker attempts)
{
    /// <summary>
    /// Verifies credentials and issues a token, subject to the brute-force
    /// throttle. The controller maps the outcome to 200 / 401 / 429.
    /// </summary>
    /// <param name="request">The submitted email and password.</param>
    /// <param name="clientIp">
    /// The caller's address, or null when the host cannot tell — the throttle
    /// then relies on the account dimension alone rather than lumping every
    /// caller into one bucket, which would lock the whole vault out at once.
    /// </param>
    /// <param name="ct">Cancellation token.</param>
    public async Task<LoginResult> LoginAsync(LoginRequest request, string? clientIp, CancellationToken ct)
    {
        var typed = AccountKey(request.Email);

        // Read-only pre-gate, before any database work. It normally recognises an
        // already-throttled account, because the key is derived exactly the way
        // the canonical one below is — and that matters: the users table has no
        // index on Email alone, so letting a refused attempt reach SQL would hand
        // an attacker an unlimited number of free scans.
        var known = attempts.CheckAccount(typed);
        if (!known.Allowed)
        {
            return LoginResult.Throttled(known.RetryAfter);
        }

        // Takes an in-flight slot as well as checking the address's cool-off, and
        // holds it until the attempt is done. Checking alone would leave the
        // address rule to be outrun by concurrency: thousands of simultaneous
        // guesses against distinct accounts would all pass a check before the
        // first of them had finished failing.
        var client = attempts.BeginClientAttempt(clientIp);
        if (!client.Allowed)
        {
            return LoginResult.Throttled(client.RetryAfter);
        }

        try
        {
            var user = await users.FindForLoginAsync(request.Email.Trim(), ct);

            // Key on the stored spelling whenever the user exists. SQL Server
            // matches emails case-insensitively, so keying on what was typed
            // would let an attacker mint a fresh budget per spelling of one
            // account. Unknown accounts fall back to the same normalization of
            // the input — they must be counted too, and a key that disagreed
            // with the canonical one would make 401-vs-429 an existence oracle.
            var account = user is null ? typed : AccountKey(user.Email);

            // Charges the attempt as it checks, so a burst of simultaneous
            // guesses cannot all slip through one budget.
            var throttled = attempts.BeginAccountAttempt(account);
            if (!throttled.Allowed)
            {
                return LoginResult.Throttled(throttled.RetryAfter);
            }

            if (user?.PasswordHash is null || !passwords.Verify(user, user.PasswordHash, request.Password))
            {
                attempts.RecordFailure(clientIp);
                return LoginResult.Rejected;
            }

            attempts.RecordSuccess(account);
            var (token, expiresAt) = tokens.IssueToken(user);
            return LoginResult.Ok(new LoginResponse(token, expiresAt, user.ToProfileDto()));
        }
        finally
        {
            attempts.EndClientAttempt(clientIp);
        }
    }

    /// <summary>
    /// The identity the throttle counts against: trimmed, bounded, stripped of
    /// characters that are invisible, width-folded and lower-cased.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Bounded first, because this string is retained in memory for as long as
    /// the record lives — an unbounded key is a memory exhaustion attack even
    /// though the validator already caps the field. Bounded again afterwards,
    /// because compatibility normalization <em>expands</em>: one character
    /// (U+FDFA) becomes eighteen, so a cap on the input is not a cap on the key.
    /// </para>
    /// <para>
    /// And trimmed <em>last</em>, which is not a detail. Stripping an invisible
    /// character can expose a trailing space that was hiding behind it, and
    /// normalization maps a no-break space onto a plain one — either way a
    /// leading trim has already run and the space survives into the key. SQL
    /// Server ignores trailing spaces, so the lookup would still find the user
    /// while the typed key and the stored key disagreed, which is exactly the
    /// existence oracle this method exists to close.
    /// </para>
    /// <para>
    /// The folding chases SQL Server's collation, which weighs a soft hyphen or
    /// a zero-width joiner as nothing and ignores width. Two spellings the
    /// database treats as one account have to reach one key, or ten attempts at
    /// the invisible spelling followed by one at the plain one would answer
    /// "does this account exist?" — 429 if the lookup folded them together, 401
    /// if it did not. It cannot match every collation exactly; over-folding only
    /// makes two odd spellings share a budget, which is harmless.
    /// </para>
    /// </remarks>
    private static string AccountKey(string email)
    {
        var trimmed = Bound(email.Trim());

        var kept = new StringBuilder(trimmed.Length);
        foreach (var c in trimmed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.Format)
            {
                kept.Append(c);
            }
        }

        var stripped = kept.ToString();
        try
        {
            stripped = stripped.Normalize(NormalizationForm.FormKC);
        }
        catch (ArgumentException)
        {
            // Unpaired surrogates: not normalizable, and not a reason to 500.
            // The unnormalized string is still a perfectly good dictionary key.
        }

        return Bound(stripped.ToLowerInvariant()).Trim();
    }

    /// <summary>Caps a key's length without splitting a surrogate pair.</summary>
    private static string Bound(string value)
    {
        if (value.Length <= LoginRequestValidator.MaxEmailLength)
        {
            return value;
        }

        var cut = value[..LoginRequestValidator.MaxEmailLength];
        return cut.Length > 0 && char.IsHighSurrogate(cut[^1]) ? cut[..^1] : cut;
    }
}
