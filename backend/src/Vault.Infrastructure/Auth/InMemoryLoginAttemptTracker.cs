using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.Options;
using Vault.Application.Abstractions;

namespace Vault.Infrastructure.Auth;

/// <summary>
/// Process-local <see cref="ILoginAttemptTracker"/>: two dictionaries of recent
/// attempts behind one lock, pruned as it goes.
/// </summary>
/// <remarks>
/// <para>
/// The idiom is <c>SetupCoordinator</c>'s, deliberately — a list of timestamps,
/// a rolling window, a lock — because the app already answers "how do we survive
/// someone guessing at the front door?" that way and a second, different answer
/// would be a second thing to reason about.
/// </para>
/// <para>
/// <b>What this does not survive:</b> a restart, and a second instance. The
/// counts live in memory, so a deploy hands every attacker a clean slate, and a
/// scaled-out deployment throttles per node rather than per cluster. Both are
/// acceptable for v1 — a restart is not something an attacker can trigger, and
/// the app runs single-instance — and both are fixed by the same thing: moving
/// this state to a shared store. That is a schema change, so it is a documented
/// follow-up rather than something smuggled in here.
/// </para>
/// </remarks>
public sealed class InMemoryLoginAttemptTracker(IOptions<LoginThrottleOptions> options, TimeProvider clock)
    : ILoginAttemptTracker
{
    /// <summary>How often stale records are swept, at most. Sweeping on every
    /// attempt would let an attacker pay for a full scan with each guess.</summary>
    private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(1);

    /// <summary>
    /// How long a concurrency refusal asks the caller to wait. Deliberately tiny:
    /// it is not a penalty, it is back-pressure, and the slot may already be free.
    /// </summary>
    private static readonly TimeSpan ConcurrencyRetry = TimeSpan.FromSeconds(1);

    private readonly LoginThrottleOptions _options = options.Value;
    private readonly Dictionary<string, AttemptRecord> _accounts = new(StringComparer.Ordinal);
    private readonly Dictionary<string, AttemptRecord> _clients = new(StringComparer.Ordinal);

    /// <summary>Attempts from each address that are in the password check right
    /// now. Entries exist only while a request does, so it is self-bounding.</summary>
    private readonly Dictionary<string, int> _inFlight = new(StringComparer.Ordinal);

    private readonly Lock _gate = new();

    private DateTimeOffset _nextSweep = DateTimeOffset.MinValue;

    /// <inheritdoc />
    public LoginThrottleDecision CheckAccount(string accountKey)
    {
        if (!_options.Enabled)
        {
            return LoginThrottleDecision.Allow;
        }

        lock (_gate)
        {
            return Verdict(_accounts, accountKey, clock.GetUtcNow());
        }
    }

    /// <inheritdoc />
    public LoginThrottleDecision BeginClientAttempt(string? clientIp)
    {
        // No address means the host cannot tell callers apart (a unix socket, a
        // test server). Skipping the dimension leaves the account rule doing the
        // work; the alternative — one shared bucket — would let any single
        // attacker throttle every user of the deployment at once.
        if (!_options.Enabled || string.IsNullOrEmpty(clientIp))
        {
            return LoginThrottleDecision.Allow;
        }

        var key = ClientKey(clientIp);
        lock (_gate)
        {
            var verdict = Verdict(_clients, key, clock.GetUtcNow());
            if (!verdict.Allowed)
            {
                return verdict;
            }

            _inFlight.TryGetValue(key, out var current);
            if (current >= _options.MaxConcurrentPerClient)
            {
                return LoginThrottleDecision.Deny(ConcurrencyRetry);
            }

            _inFlight[key] = current + 1;
            return LoginThrottleDecision.Allow;
        }
    }

    /// <inheritdoc />
    public void EndClientAttempt(string? clientIp)
    {
        if (!_options.Enabled || string.IsNullOrEmpty(clientIp))
        {
            return;
        }

        var key = ClientKey(clientIp);
        lock (_gate)
        {
            if (!_inFlight.TryGetValue(key, out var current))
            {
                return;
            }

            if (current <= 1)
            {
                _inFlight.Remove(key);
            }
            else
            {
                _inFlight[key] = current - 1;
            }
        }
    }

    /// <inheritdoc />
    public LoginThrottleDecision BeginAccountAttempt(string accountKey)
    {
        if (!_options.Enabled)
        {
            return LoginThrottleDecision.Allow;
        }

        lock (_gate)
        {
            var now = clock.GetUtcNow();
            Sweep(now);

            var verdict = Verdict(_accounts, accountKey, now);
            if (!verdict.Allowed)
            {
                return verdict;
            }

            // Charged inside the same lock as the check: this is what a burst of
            // simultaneous guesses cannot walk past. The attempt that trips the
            // limit still proceeds — the penalty starts with the next one — so
            // the tenth failure is still answered 401 and the eleventh 429.
            Charge(_accounts, accountKey, _options.MaxAccountFailures, escalating: true, now);
            return LoginThrottleDecision.Allow;
        }
    }

    /// <inheritdoc />
    public void RecordFailure(string? clientIp)
    {
        if (!_options.Enabled || string.IsNullOrEmpty(clientIp))
        {
            return;
        }

        lock (_gate)
        {
            var now = clock.GetUtcNow();
            Sweep(now);
            Charge(_clients, ClientKey(clientIp), _options.MaxClientFailures, escalating: false, now);
        }
    }

    /// <inheritdoc />
    public void RecordSuccess(string accountKey)
    {
        lock (_gate)
        {
            _accounts.Remove(accountKey);
        }
    }

    /// <summary>
    /// What counts as "one client". Two normalizations, both load-bearing.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Kestrel on a dual-stack socket reports an IPv4 caller as an IPv4-mapped
    /// IPv6 address, so the same client can arrive spelled two ways and would
    /// otherwise get two budgets.
    /// </para>
    /// <para>
    /// And a single IPv6 address is not a client: the smallest allocation anyone
    /// is handed is a /64, which is 18 quintillion addresses to rotate through,
    /// so counting per address would make this dimension free to bypass for
    /// anyone with IPv6 while still costing an IPv4 attacker real addresses.
    /// The prefix is the narrowest thing that behaves like one subscriber.
    /// </para>
    /// </remarks>
    private static string ClientKey(string clientIp)
    {
        if (!IPAddress.TryParse(clientIp, out var address))
        {
            return clientIp;
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily != AddressFamily.InterNetworkV6)
        {
            return address.ToString();
        }

        var bytes = address.GetAddressBytes();
        Array.Clear(bytes, 8, 8);
        return $"{new IPAddress(bytes)}/64";
    }

    private static LoginThrottleDecision Verdict(
        Dictionary<string, AttemptRecord> records,
        string key,
        DateTimeOffset now)
    {
        if (!records.TryGetValue(key, out var record) || record.BlockedUntil is not { } until)
        {
            return LoginThrottleDecision.Allow;
        }

        return until > now ? LoginThrottleDecision.Deny(until - now) : LoginThrottleDecision.Allow;
    }

    private void Charge(
        Dictionary<string, AttemptRecord> records,
        string key,
        int threshold,
        bool escalating,
        DateTimeOffset now)
    {
        if (!records.TryGetValue(key, out var record))
        {
            MakeRoom(records, now);
            record = new AttemptRecord();
            records[key] = record;
        }

        record.LastSeen = now;
        if (record.BlockedUntil > now)
        {
            // Already serving a penalty. Only reachable on the address, whose
            // gate is read-only; extending the block for attempts that were
            // already refused would let one burst multiply the penalty.
            return;
        }

        record.Charges.RemoveAll(t => t <= now - _options.FailureWindow);
        record.Charges.Add(now);
        if (record.Charges.Count < threshold)
        {
            return;
        }

        // The window is spent, not merely full: clearing it means the caller
        // gets a whole fresh allowance once the penalty expires, instead of
        // being re-blocked by one more attempt against a still-full window.
        record.Charges.Clear();
        record.PenaltyLevel = Math.Min(record.PenaltyLevel + 1, 32);
        record.BlockedUntil = now + (escalating ? EscalatedDelay(record.PenaltyLevel) : _options.ClientDelay);
    }

    /// <summary>Doubles the base delay once per consecutive trip, capped.</summary>
    private TimeSpan EscalatedDelay(int level)
    {
        var max = _options.MaxAccountDelay;
        var delay = _options.AccountDelay;
        for (var i = 1; i < level; i++)
        {
            if (delay >= max)
            {
                break;
            }

            // Compare before doubling: TimeSpan.MaxValue is reachable from a
            // misconfigured base and doubling past it throws.
            delay = delay.Ticks > max.Ticks / 2 ? max : delay * 2;
        }

        return delay > max ? max : delay;
    }

    private void Sweep(DateTimeOffset now)
    {
        if (now < _nextSweep)
        {
            return;
        }

        _nextSweep = now + SweepInterval;
        Drop(_accounts, now);
        Drop(_clients, now);
    }

    private void Drop(Dictionary<string, AttemptRecord> records, DateTimeOffset now)
    {
        var cutoff = now - _options.RecordExpiry;
        foreach (var key in records
                     // A record still serving a penalty stays, however idle it is:
                     // dropping it would end the penalty early.
                     .Where(e => e.Value.LastSeen < cutoff
                                 && (e.Value.BlockedUntil is not { } until || until <= now))
                     .Select(e => e.Key)
                     .ToArray())
        {
            records.Remove(key);
        }
    }

    /// <summary>Frees space for one new record once the ceiling is reached.</summary>
    /// <remarks>
    /// <para>
    /// A record serving a live penalty is never dropped while anything else can
    /// be — dropping one hands an attacker back their allowance, and a flood of
    /// distinct keys is exactly how they would try to arrange it. One pass, no
    /// sort: this runs under the lock every login takes, so ordering 20 000
    /// entries here would be a stall an attacker could trigger at will.
    /// </para>
    /// <para>
    /// When <em>everything</em> is serving a penalty, one is still dropped —
    /// the one closest to expiring, so the least is lost. Refusing to track
    /// anything new instead would let a flood switch the account rule off for
    /// every account not already in the table, which is far worse than one
    /// penalty ending early.
    /// </para>
    /// </remarks>
    private void MakeRoom(Dictionary<string, AttemptRecord> records, DateTimeOffset now)
    {
        if (records.Count < _options.MaxTrackedRecords)
        {
            return;
        }

        var target = Math.Max(1, _options.MaxTrackedRecords / 10);
        var victims = new List<string>(target);
        foreach (var (key, record) in records)
        {
            if (record.BlockedUntil > now)
            {
                continue;
            }

            victims.Add(key);
            if (victims.Count == target)
            {
                break;
            }
        }

        if (victims.Count == 0)
        {
            victims.Add(records.MinBy(e => e.Value.BlockedUntil ?? DateTimeOffset.MaxValue).Key);
        }

        foreach (var key in victims)
        {
            records.Remove(key);
        }
    }

    /// <summary>One key's recent attempts, current penalty and escalation level.</summary>
    private sealed class AttemptRecord
    {
        public List<DateTimeOffset> Charges { get; } = [];

        public DateTimeOffset? BlockedUntil { get; set; }

        public int PenaltyLevel { get; set; }

        public DateTimeOffset LastSeen { get; set; }
    }
}
