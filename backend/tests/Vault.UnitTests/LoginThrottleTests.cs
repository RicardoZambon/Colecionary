using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Vault.Application.Abstractions;
using Vault.Infrastructure.Auth;

namespace Vault.UnitTests;

/// <summary>
/// The login throttle's arithmetic, on a clock we control.
///
/// <para>
/// The integration suite proves the endpoint really answers 429 and really
/// answers it in the caller's language, but it cannot wind time forward, and it
/// cannot exercise the per-address dimension: every request in it arrives from
/// the same test server. So the rules that depend on <em>when</em> — the window
/// draining, the penalty expiring, the escalation doubling — and the rules that
/// depend on <em>who</em> live here, where both are just parameters.
/// </para>
///
/// <para>
/// <see cref="Attempt"/> reproduces <c>AuthService.LoginAsync</c>'s exact call
/// sequence, including releasing the in-flight slot in a <c>finally</c>. A test
/// that charged the address for an attempt the account gate had already refused
/// would be testing a sequence the app never performs.
/// </para>
/// </summary>
public class LoginThrottleTests
{
    private const string Account = "marcus@example.com";
    private const string OtherAccount = "ana@example.com";
    private const string Address = "203.0.113.7";
    private const string OtherAddress = "198.51.100.4";

    private static readonly DateTimeOffset Start = new(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);

    private static (ILoginAttemptTracker Tracker, FakeTimeProvider Clock) Build(
        Action<LoginThrottleOptions>? configure = null)
    {
        var options = new LoginThrottleOptions();
        configure?.Invoke(options);
        var clock = new FakeTimeProvider(Start);
        return (new InMemoryLoginAttemptTracker(Options.Create(options), clock), clock);
    }

    /// <summary>One sign-in attempt, in the order the service makes the calls.</summary>
    /// <returns>True when the attempt reached the password check.</returns>
    private static bool Attempt(
        ILoginAttemptTracker tracker,
        string account,
        string? address,
        bool correctPassword = false)
    {
        if (!tracker.CheckAccount(account).Allowed || !tracker.BeginClientAttempt(address).Allowed)
        {
            return false;
        }

        try
        {
            if (!tracker.BeginAccountAttempt(account).Allowed)
            {
                return false;
            }

            if (correctPassword)
            {
                tracker.RecordSuccess(account);
            }
            else
            {
                tracker.RecordFailure(address);
            }

            return true;
        }
        finally
        {
            tracker.EndClientAttempt(address);
        }
    }

    /// <summary>Reads the address rule without holding the slot it has to take.</summary>
    private static LoginThrottleDecision PeekClient(ILoginAttemptTracker tracker, string? address)
    {
        var decision = tracker.BeginClientAttempt(address);
        if (decision.Allowed)
        {
            tracker.EndClientAttempt(address);
        }

        return decision;
    }

    private static void Fail(ILoginAttemptTracker tracker, string account, string? address, int times)
    {
        for (var i = 0; i < times; i++)
        {
            Attempt(tracker, account, address);
        }
    }

    /// <summary>Failures against a fresh account each time — the password-spraying shape.</summary>
    private static void Spray(ILoginAttemptTracker tracker, string? address, int times)
    {
        for (var i = 0; i < times; i++)
        {
            Attempt(tracker, $"sprayed-{Guid.NewGuid():N}@example.com", address);
        }
    }

    [Fact]
    public void FailuresBelowTheLimit_DoNotThrottle()
    {
        var (tracker, _) = Build();

        Fail(tracker, Account, Address, 9);

        Assert.True(PeekClient(tracker, Address).Allowed);
        Assert.True(tracker.CheckAccount(Account).Allowed);
    }

    [Fact]
    public void TheTenthFailure_ThrottlesTheAccount_ForTheBaseDelay()
    {
        var (tracker, _) = Build();

        Fail(tracker, Account, Address, 10);

        var decision = tracker.CheckAccount(Account);
        Assert.False(decision.Allowed);
        Assert.Equal(TimeSpan.FromMinutes(5), decision.RetryAfter);
    }

    /// <remarks>
    /// The pre-gate the service asks before it touches the database has to be
    /// free: if reading the verdict spent budget, every login would cost two
    /// charges and the limit would silently halve.
    /// </remarks>
    [Fact]
    public void TheReadOnlyAccountCheck_SpendsNothing()
    {
        var (tracker, _) = Build();

        for (var i = 0; i < 50; i++)
        {
            Assert.True(tracker.CheckAccount(Account).Allowed);
        }

        Fail(tracker, Account, Address, 9);
        Assert.True(tracker.CheckAccount(Account).Allowed);
    }

    /// <remarks>
    /// The whole reason a success refunds the account. A person who has
    /// forgotten which password they used must not be locked out by finally
    /// remembering it.
    /// </remarks>
    [Fact]
    public void ASuccessfulSignIn_ClearsTheAccountsRecord()
    {
        var (tracker, _) = Build();
        Fail(tracker, Account, Address, 9);

        Assert.True(Attempt(tracker, Account, Address, correctPassword: true));

        Fail(tracker, Account, Address, 9);
        Assert.True(tracker.CheckAccount(Account).Allowed);
    }

    /// <remarks>
    /// If one working credential wiped the address's record, every
    /// credential-stuffing run would park a valid login between batches and
    /// never be throttled at all.
    /// </remarks>
    [Fact]
    public void ASuccessfulSignIn_DoesNotClearTheAddressRecord()
    {
        var (tracker, _) = Build(o => o.MaxClientFailures = 12);
        Fail(tracker, Account, Address, 10);

        Assert.True(Attempt(tracker, OtherAccount, Address, correctPassword: true));
        Fail(tracker, "third@example.com", Address, 2);

        Assert.False(PeekClient(tracker, Address).Allowed);
    }

    [Fact]
    public void AttemptsOlderThanTheWindow_StopCounting()
    {
        var (tracker, clock) = Build();
        Fail(tracker, Account, Address, 9);

        clock.Advance(TimeSpan.FromMinutes(5) + TimeSpan.FromSeconds(1));
        Fail(tracker, Account, Address, 9);

        Assert.True(tracker.CheckAccount(Account).Allowed);
    }

    [Fact]
    public void ThePenaltyExpiresOnItsOwn_AndTheAllowanceComesBackWhole()
    {
        var (tracker, clock) = Build();
        Fail(tracker, Account, Address, 10);

        clock.Advance(TimeSpan.FromMinutes(5));

        // Not "one more failure re-blocks you": the spent window was cleared, so
        // the next block costs another ten.
        Fail(tracker, Account, Address, 9);
        Assert.True(tracker.CheckAccount(Account).Allowed);
    }

    /// <remarks>
    /// Escalation is what makes a persistent attacker's guesses cost more each
    /// round; the cap is what stops that from becoming a stranger's unbounded
    /// denial of service against a named user. The address is left out of it
    /// here — five rounds of ten would trip the address rule long before the
    /// account rule reached its ceiling, and it is the ceiling under test.
    /// </remarks>
    [Theory]
    [InlineData(1, 5)]
    [InlineData(2, 10)]
    [InlineData(3, 20)]
    [InlineData(4, 30)]
    [InlineData(5, 30)]
    public void ConsecutiveTrips_DoubleTheDelay_UpToTheCap(int round, int expectedMinutes)
    {
        var (tracker, clock) = Build();

        for (var i = 1; i < round; i++)
        {
            Fail(tracker, Account, address: null, times: 10);
            clock.Advance(tracker.CheckAccount(Account).RetryAfter);
        }

        Fail(tracker, Account, address: null, times: 10);

        Assert.Equal(TimeSpan.FromMinutes(expectedMinutes), tracker.CheckAccount(Account).RetryAfter);
    }

    [Fact]
    public void AnAccountThatEventuallySucceeds_StartsTheNextEscalationFromScratch()
    {
        var (tracker, clock) = Build();
        Fail(tracker, Account, Address, 10);

        clock.Advance(TimeSpan.FromMinutes(5));
        Assert.True(Attempt(tracker, Account, Address, correctPassword: true));

        Fail(tracker, Account, Address, 10);
        Assert.Equal(TimeSpan.FromMinutes(5), tracker.CheckAccount(Account).RetryAfter);
    }

    /// <remarks>
    /// The per-account rule alone would miss this entirely: nine guesses each
    /// against four accounts trips nothing, and password spraying is exactly
    /// that shape.
    /// </remarks>
    [Fact]
    public void FailuresSpreadAcrossAccounts_StillThrottleTheAddress()
    {
        var (tracker, _) = Build();

        Spray(tracker, Address, 30);

        Assert.False(PeekClient(tracker, Address).Allowed);
    }

    [Fact]
    public void AThrottledAddress_DoesNotThrottleAnother()
    {
        var (tracker, _) = Build();
        Spray(tracker, Address, 30);

        Assert.False(PeekClient(tracker, Address).Allowed);
        Assert.True(PeekClient(tracker, OtherAddress).Allowed);
    }

    /// <remarks>
    /// The address cool-off is flat by design — an address is shared (NAT, a
    /// carrier, a household), so escalating on it compounds the punishment of
    /// bystanders.
    /// </remarks>
    [Fact]
    public void TheAddressCoolOff_DoesNotEscalate()
    {
        var (tracker, clock) = Build();
        Spray(tracker, Address, 30);
        Assert.Equal(TimeSpan.FromMinutes(5), PeekClient(tracker, Address).RetryAfter);

        clock.Advance(TimeSpan.FromMinutes(5));
        Spray(tracker, Address, 30);

        Assert.Equal(TimeSpan.FromMinutes(5), PeekClient(tracker, Address).RetryAfter);
    }

    /// <remarks>
    /// One IPv6 address is not one client: the smallest allocation anyone is
    /// handed is a /64, so counting per address would make the dimension free to
    /// bypass for anyone with IPv6 while still costing an IPv4 attacker real
    /// addresses.
    /// </remarks>
    [Fact]
    public void AddressesInOneIpv6Prefix_ShareOneBudget()
    {
        var (tracker, _) = Build();

        for (var i = 0; i < 30; i++)
        {
            Attempt(tracker, $"sprayed-{i}@example.com", $"2001:db8:1:2::{i + 1:x}");
        }

        Assert.False(PeekClient(tracker, "2001:db8:1:2::dead").Allowed);
        Assert.True(PeekClient(tracker, "2001:db8:1:3::1").Allowed);
    }

    /// <remarks>
    /// Kestrel on a dual-stack socket reports an IPv4 caller in mapped form, so
    /// without normalization the same client would arrive spelled two ways and
    /// get two budgets.
    /// </remarks>
    [Fact]
    public void AnIpv4MappedAddress_IsTheSameClientAsThePlainForm()
    {
        var (tracker, _) = Build();

        Spray(tracker, $"::ffff:{Address}", 30);

        Assert.False(PeekClient(tracker, Address).Allowed);
    }

    /// <remarks>
    /// A host that cannot see the caller's address (a unix socket, a test
    /// server) must not collapse every caller into one bucket — that would let a
    /// single attacker throttle the whole deployment. The account rule keeps
    /// working.
    /// </remarks>
    [Fact]
    public void WithNoAddress_OnlyTheAccountDimensionApplies()
    {
        var (tracker, _) = Build();

        Spray(tracker, address: null, times: 60);
        Fail(tracker, Account, address: null, times: 10);

        Assert.True(PeekClient(tracker, null).Allowed);
        Assert.False(tracker.CheckAccount(Account).Allowed);
    }

    [Fact]
    public void AnIdleRecord_IsForgotten_WhichAlsoResetsTheEscalation()
    {
        var (tracker, clock) = Build();
        Fail(tracker, Account, Address, 10);

        // Past the expiry, then one attempt elsewhere to drive the sweep.
        clock.Advance(TimeSpan.FromHours(2));
        Attempt(tracker, OtherAccount, OtherAddress);

        Fail(tracker, Account, Address, 10);
        Assert.Equal(TimeSpan.FromMinutes(5), tracker.CheckAccount(Account).RetryAfter);
    }

    /// <remarks>
    /// <para>
    /// Without a ceiling, posting a million distinct emails would turn the
    /// defence into a memory exhaustion attack of its own. The flood here is
    /// deliberately made of records that are *blocked* — an eviction policy that
    /// only spares live penalties while there is something else to drop is no
    /// protection at all, and that is the shape an attacker would build.
    /// </para>
    /// <para>
    /// Two properties, and they pull against each other. The escalated penalty
    /// outlives a flood of cheaper ones, and the table never stops accepting new
    /// records — a ceiling that refused new keys would let the same flood switch
    /// the account rule off for everyone not already in it.
    /// </para>
    /// </remarks>
    [Fact]
    public void AFloodOfBlockedRecords_LosesToTheLongerPenalty_AndNeverStopsTracking()
    {
        var (tracker, clock) = Build(o =>
        {
            o.MaxTrackedRecords = 200;
            o.MaxAccountFailures = 1;
        });

        // Twice, so the account under attack is serving a ten-minute penalty
        // while everything in the flood is serving five.
        Fail(tracker, Account, address: null, times: 1);
        clock.Advance(TimeSpan.FromMinutes(5));
        Fail(tracker, Account, address: null, times: 1);
        Assert.Equal(TimeSpan.FromMinutes(10), tracker.CheckAccount(Account).RetryAfter);

        // Every one of these blocks on its first failure, so the dictionary fills
        // with nothing but live penalties.
        Spray(tracker, address: null, times: 5_000);

        Assert.False(tracker.CheckAccount(Account).Allowed);

        Fail(tracker, "newcomer@example.com", address: null, times: 1);
        Assert.False(tracker.CheckAccount("newcomer@example.com").Allowed);
    }

    [Fact]
    public void Disabled_NothingIsEverThrottled()
    {
        var (tracker, _) = Build(o => o.Enabled = false);

        Fail(tracker, Account, Address, 100);
        Spray(tracker, Address, 100);

        Assert.True(tracker.CheckAccount(Account).Allowed);
        Assert.True(PeekClient(tracker, Address).Allowed);
    }

    /// <remarks>
    /// Back-pressure, not a penalty: the refusal has to clear the instant a slot
    /// frees, or a busy moment would become a five-minute outage for everyone
    /// behind one address.
    /// </remarks>
    [Fact]
    public void MoreSimultaneousAttemptsThanTheCap_AreRefusedUntilASlotFrees()
    {
        var (tracker, _) = Build(o => o.MaxConcurrentPerClient = 2);

        Assert.True(tracker.BeginClientAttempt(Address).Allowed);
        Assert.True(tracker.BeginClientAttempt(Address).Allowed);

        var refused = tracker.BeginClientAttempt(Address);
        Assert.False(refused.Allowed);
        Assert.True(refused.RetryAfter <= TimeSpan.FromSeconds(1));

        tracker.EndClientAttempt(Address);
        Assert.True(tracker.BeginClientAttempt(Address).Allowed);
    }

    /// <remarks>
    /// The gate charges as it checks, so simultaneous guesses cannot all pass a
    /// budget none of them has paid for yet. Checking and then charging in two
    /// separate lock acquisitions would let a burst of a thousand parallel
    /// requests take a thousand guesses out of an allowance of ten.
    /// </remarks>
    [Fact]
    public async Task ABurstOfSimultaneousGuesses_CannotOutrunTheAccountGate()
    {
        var (tracker, _) = Build();

        var reached = await Task.WhenAll(Enumerable.Range(0, 200).Select(_ =>
            Task.Run(() => Attempt(tracker, Account, address: null) ? 1 : 0)));

        Assert.Equal(10, reached.Sum());
    }

    /// <remarks>
    /// The same attack against the address rule, which cannot charge up front
    /// without punishing a legitimate crowd. The in-flight cap is what bounds it:
    /// without one, thousands of simultaneous sprays against distinct accounts
    /// would every one reach a password hash before the thirtieth failure landed.
    /// </remarks>
    [Fact]
    public async Task ABurstOfSprayedGuesses_CannotOutrunTheAddressRule()
    {
        var (tracker, _) = Build();

        var reached = await Task.WhenAll(Enumerable.Range(0, 500).Select(i =>
            Task.Run(() => Attempt(tracker, $"burst-{i}@example.com", Address) ? 1 : 0)));

        // Thirty is the limit; the slack is the handful that can already be past
        // the gate when the thirtieth failure trips it.
        Assert.InRange(reached.Sum(), 30, 30 + 8);
    }
}
