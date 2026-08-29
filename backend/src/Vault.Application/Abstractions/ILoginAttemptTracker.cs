namespace Vault.Application.Abstractions;

/// <summary>
/// Remembers recent sign-in attempts so a brute force runs out of budget long
/// before it runs out of guesses.
/// </summary>
/// <remarks>
/// <para>
/// Two independent dimensions, because neither is sufficient alone. Throttling
/// only the caller's address is weak against an attacker spread over a botnet
/// and punishes everyone behind one NAT; throttling only the account hands a
/// stranger a denial of service against a named user, since failing logins on
/// someone else's address is free. Together, the address rule costs a
/// distributed attacker addresses and the account rule costs them time.
/// </para>
/// <para>
/// <b>A correct password is never rate limited.</b> The account's budget is
/// charged when the attempt starts and refunded the moment it succeeds, so a
/// user who mistypes nine times and then gets it right is not left waiting, and
/// a busy office egress address is never spent by people signing in
/// successfully — only failures are ever charged to an address.
/// </para>
/// <para>
/// The asymmetry — the account charged up front, the address only on failure —
/// is deliberate, and is about concurrency. A gate that only reads state can be
/// walked past by a thousand simultaneous guesses, all of which pass a check
/// none of them has paid for yet; charging inside the same lock as the check
/// closes that. Charging the address the same way would mean a burst of
/// *legitimate* simultaneous sign-ins from one office could trip a shared
/// identifier before any of them was refunded — a five-minute outage for
/// bystanders, which is precisely the collateral damage that dimension's looser
/// limit exists to avoid. The address answers the same concurrency problem with
/// an in-flight slot instead, which costs a crowd a retry rather than a penalty.
/// </para>
/// </remarks>
public interface ILoginAttemptTracker
{
    /// <summary>
    /// Whether this account is currently throttled. Read-only, so it can be
    /// asked before any database work — a refused attempt should not be able to
    /// buy a query.
    /// </summary>
    LoginThrottleDecision CheckAccount(string accountKey);

    /// <summary>
    /// Whether attempts from this address may proceed, and takes an in-flight
    /// slot when they may. Every allowed call must be paired with
    /// <see cref="EndClientAttempt"/> in a <c>finally</c>.
    /// </summary>
    /// <remarks>
    /// The slot is what a purely read-only address check cannot do: a burst of
    /// thousands of simultaneous guesses against thousands of distinct accounts
    /// would otherwise all pass the check before the first failure was recorded,
    /// turning a limit of thirty into a limit of however many requests fit in
    /// flight — and every one of them a full password hash. Refusing on
    /// concurrency is deliberately *not* a penalty: it clears the instant a slot
    /// frees, so a legitimate crowd retries rather than being locked out.
    /// </remarks>
    /// <param name="clientIp">The caller's address, or null when the host cannot tell.</param>
    LoginThrottleDecision BeginClientAttempt(string? clientIp);

    /// <summary>Releases the in-flight slot taken by <see cref="BeginClientAttempt"/>.</summary>
    /// <param name="clientIp">The same address that was passed to begin the attempt.</param>
    void EndClientAttempt(string? clientIp);

    /// <summary>
    /// Charges one attempt to the account and says whether it may proceed to a
    /// password check. The charge and the check happen together, under one lock.
    /// </summary>
    /// <param name="accountKey">
    /// Normalized account identity. Callers must pass a key for accounts that do
    /// not exist as well: if only real ones were counted, the 429 would answer
    /// the question "does this address have an account here?".
    /// </param>
    LoginThrottleDecision BeginAccountAttempt(string accountKey);

    /// <summary>
    /// The attempt failed. Charges the address; the account's charge, taken by
    /// <see cref="BeginAccountAttempt"/>, simply stands.
    /// </summary>
    /// <param name="clientIp">The caller's address, or null when the host cannot tell.</param>
    void RecordFailure(string? clientIp);

    /// <summary>
    /// The attempt succeeded. Clears the account's record — its charges and its
    /// escalation level.
    /// </summary>
    /// <remarks>
    /// Deliberately does <b>not</b> touch the address's record: one valid
    /// credential must not wipe the evidence of the failed guesses that came
    /// from the same place, or every credential-stuffing run would simply park a
    /// working login between batches.
    /// </remarks>
    void RecordSuccess(string accountKey);
}

/// <summary>The answer to "may this attempt proceed?", with how long to wait if not.</summary>
/// <param name="Allowed">False when the attempt must be refused with 429.</param>
/// <param name="RetryAfter">How long until the caller may try again. Zero when allowed.</param>
public readonly record struct LoginThrottleDecision(bool Allowed, TimeSpan RetryAfter)
{
    /// <summary>The attempt may proceed.</summary>
    public static LoginThrottleDecision Allow { get; } = new(true, TimeSpan.Zero);

    /// <summary>The attempt must be refused for <paramref name="retryAfter"/>.</summary>
    public static LoginThrottleDecision Deny(TimeSpan retryAfter) => new(false, retryAfter);
}
