using System.ComponentModel.DataAnnotations;

namespace Vault.Infrastructure.Auth;

/// <summary>
/// Tuning for the login brute-force throttle. Every value has a working default,
/// so an operator who never writes a <c>LoginThrottle</c> section still gets the
/// protection — configuration only moves the dials.
/// </summary>
public sealed class LoginThrottleOptions
{
    /// <summary>Configuration section these values bind from.</summary>
    public const string SectionName = "LoginThrottle";

    /// <summary>
    /// Master switch. Kept because a deployment can land behind a proxy or an
    /// identity gateway that already throttles, and turning this off in
    /// configuration is safer than the alternative of setting nonsense limits.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// How long a failure is remembered. Matches <c>SetupCoordinator</c>'s
    /// five-minute lockout window — the app already has one answer to
    /// "how long is a burst of failures a burst?" and does not need a second.
    /// </summary>
    public TimeSpan FailureWindow { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Failures against one account inside <see cref="FailureWindow"/> before it
    /// is throttled. Ten, like <c>SetupCoordinator.MaxAttempts</c>: enough for a
    /// person who has genuinely forgotten which password they used.
    /// </summary>
    [Range(1, 10_000)]
    public int MaxAccountFailures { get; set; } = 10;

    /// <summary>
    /// The first penalty an account gets for tripping <see cref="MaxAccountFailures"/>.
    /// </summary>
    public TimeSpan AccountDelay { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Ceiling on the escalated account penalty. The delay doubles on each
    /// consecutive trip (5 → 10 → 20 → 30 min) and stops here.
    /// </summary>
    /// <remarks>
    /// Escalating rather than locking is deliberate. A hard lockout needs a
    /// human to undo, which turns "I fail your logins" into "your account is
    /// gone until support answers"; a delay that always expires on its own
    /// degrades a stranger's denial of service into an inconvenience while
    /// still cutting an attacker's guess rate by orders of magnitude. The cap
    /// bounds how much damage a single burst of ten failures can buy.
    /// </remarks>
    public TimeSpan MaxAccountDelay { get; set; } = TimeSpan.FromMinutes(30);

    /// <summary>
    /// Failures from one address inside <see cref="FailureWindow"/> before that
    /// address is throttled. Higher than the account limit on purpose: an
    /// address is shared (office NAT, mobile carrier CGNAT, a household) and an
    /// account is not, so the collateral damage of getting it wrong is
    /// completely different.
    /// </summary>
    [Range(1, 1_000_000)]
    public int MaxClientFailures { get; set; } = 30;

    /// <summary>
    /// Cool-off for an address that trips <see cref="MaxClientFailures"/>. Flat,
    /// never escalating — for the same reason the limit is higher: escalation on
    /// a shared identifier compounds the punishment of bystanders.
    /// </summary>
    public TimeSpan ClientDelay { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Attempts from one address that may be in the password check at the same
    /// instant. Eight is far above any real crowd — a sign-in costs tens of
    /// milliseconds, so eight in flight is well over a hundred a second from one
    /// address — and far below the thousands a burst would need to outrun
    /// <see cref="MaxClientFailures"/>. Exceeding it is answered with a
    /// one-second retry, never a penalty.
    /// </summary>
    [Range(1, 10_000)]
    public int MaxConcurrentPerClient { get; set; } = 8;

    /// <summary>
    /// How long an untouched record survives. Expiry is also what resets the
    /// escalation level, so an account that was attacked last week starts clean.
    /// </summary>
    public TimeSpan RecordExpiry { get; set; } = TimeSpan.FromHours(1);

    /// <summary>
    /// Hard ceiling on tracked records. Without it, an attacker posting a
    /// million distinct addresses would turn the defence into a memory
    /// exhaustion attack of its own.
    /// </summary>
    [Range(100, 10_000_000)]
    public int MaxTrackedRecords { get; set; } = 20_000;
}
