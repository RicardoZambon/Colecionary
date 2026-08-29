using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Vault.Application.Auth;
using Vault.Application.Resources;

namespace Vault.IntegrationTests;

/// <summary>
/// Proves the login endpoint actually refuses a brute force, and refuses it in
/// the caller's language.
///
/// <para>
/// The arithmetic is pinned in <c>Vault.UnitTests.LoginThrottleTests</c>, on a
/// clock that can be wound forward. What only an end-to-end request can show is
/// that the throttle is wired into the endpoint at all, that a correct password
/// still walks straight through it, and — the ordering claim — that its 429 is
/// built <em>downstream of</em> <c>UseRequestLocalization</c>. Like the
/// ProblemDetails titles <c>LocalizationTests</c> guards, the 429's title comes
/// from <c>Messages</c> and is therefore resolved against whatever culture is
/// current when it is read. Move the throttle into a middleware registered ahead
/// of that call — the instinct, since shedding load early is cheaper — and the
/// title comes back in the host's own language however the client asked. That is
/// what <see cref="TheThrottleTitle_FollowsAcceptLanguage"/> fails on.
/// </para>
///
/// <para>
/// The two language tests are a pair and neither is redundant: on a host whose
/// own culture happened to be pt-BR, a misordered pipeline would still satisfy
/// the Portuguese one, and it is
/// <see cref="WithNoAcceptLanguage_TheThrottleTitle_IsEnglish"/> that would then
/// go red. Deleting either leaves a hole.
/// </para>
///
/// <para>
/// Every test here throttles an address that exists only in that test. The whole
/// suite shares one host, so a test that spent the demo user's budget would
/// leave the next class unable to sign in — and the failure would look like a
/// broken app rather than a careless test.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public class LoginThrottleTests(VaultApiFactory factory)
{
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en");
    private static readonly CultureInfo Portuguese = CultureInfo.GetCultureInfo("pt-BR");

    /// <summary>Matches <c>LoginThrottleOptions.MaxAccountFailures</c>, which the test host leaves at its default.</summary>
    private const int AccountLimit = 10;

    private static string FreshEmail() => $"throttle-{Guid.NewGuid():N}@example.com";

    private static Task<HttpResponseMessage> AttemptAsync(HttpClient client, string email, string password) =>
        client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));

    /// <remarks>
    /// The email deliberately belongs to nobody, which proves the second half of
    /// the rule as well: attempts are counted against accounts that do not
    /// exist, so the 429 cannot be used to ask "does this person have a vault
    /// here?".
    /// </remarks>
    [Fact]
    public async Task RepeatedFailures_EventuallyGet429()
    {
        var client = factory.CreateClient();
        var email = FreshEmail();

        for (var i = 0; i < AccountLimit; i++)
        {
            using var rejected = await AttemptAsync(client, email, "wrong");
            Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        }

        using var throttled = await AttemptAsync(client, email, "wrong");

        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.NotNull(throttled.Headers.RetryAfter);
        Assert.True(throttled.Headers.RetryAfter!.Delta > TimeSpan.Zero);
    }

    /// <remarks>
    /// The knowing password is never rate limited: the account's charge is
    /// refunded the moment the attempt succeeds, taking the failures before it
    /// along. Without that, the many tests that sign in as the demo user would
    /// start failing the moment one of them ran eleventh.
    /// </remarks>
    [Fact]
    public async Task ACorrectPassword_IsNeverImpeded()
    {
        var client = factory.CreateClient();

        for (var i = 0; i < AccountLimit + 5; i++)
        {
            using var ok = await AttemptAsync(client, "marcus@example.com", VaultApiFactory.DemoPassword);
            Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        }
    }

    /// <remarks>
    /// A few wrong guesses followed by the right one must cost nothing — that is
    /// the ordinary "which password did I use here?" case, and a throttle that
    /// punished it would be worse than the attack.
    /// </remarks>
    [Fact]
    public async Task WrongGuessesFollowedByTheRightOne_LeaveNoPenalty()
    {
        var client = factory.CreateClient();

        for (var i = 0; i < AccountLimit - 1; i++)
        {
            using var rejected = await AttemptAsync(client, "ana@example.com", "wrong");
            Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        }

        using var first = await AttemptAsync(client, "ana@example.com", VaultApiFactory.DemoPassword);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // The record is gone, not merely paused: a fresh near-miss run still fits.
        for (var i = 0; i < AccountLimit - 1; i++)
        {
            using var rejected = await AttemptAsync(client, "ana@example.com", "wrong");
            Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        }

        using var second = await AttemptAsync(client, "ana@example.com", VaultApiFactory.DemoPassword);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
    }

    /// <remarks>
    /// The account dimension is scoped to the account. If tripping one blocked
    /// the endpoint, a stranger could take the whole vault offline by guessing
    /// at an address they invented.
    /// </remarks>
    [Fact]
    public async Task AThrottledAccount_DoesNotBlockAnyoneElse()
    {
        var client = factory.CreateClient();
        var email = FreshEmail();

        for (var i = 0; i <= AccountLimit; i++)
        {
            using var _ = await AttemptAsync(client, email, "wrong");
        }

        using var throttled = await AttemptAsync(client, email, "wrong");
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);

        using var ok = await AttemptAsync(client, "dev@example.com", VaultApiFactory.DemoPassword);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    /// <summary>
    /// The 429's title is localized, which is only true while the throttle
    /// answers from inside the pipeline <c>UseRequestLocalization</c> wraps.
    /// </summary>
    [Fact]
    public async Task TheThrottleTitle_FollowsAcceptLanguage()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("pt-BR");
        var email = FreshEmail();

        for (var i = 0; i <= AccountLimit; i++)
        {
            using var _ = await AttemptAsync(client, email, "wrong");
        }

        using var throttled = await AttemptAsync(client, email, "wrong");
        var body = await throttled.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.Contains(Messages.In(nameof(Messages.TooManyLoginAttempts), Portuguese)!, body);
        Assert.DoesNotContain(Messages.In(nameof(Messages.TooManyLoginAttempts), English)!, body);
    }

    [Fact]
    public async Task WithNoAcceptLanguage_TheThrottleTitle_IsEnglish()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.AcceptLanguage.Clear();
        var email = FreshEmail();

        for (var i = 0; i <= AccountLimit; i++)
        {
            using var _ = await AttemptAsync(client, email, "wrong");
        }

        using var throttled = await AttemptAsync(client, email, "wrong");
        var body = await throttled.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.Contains(Messages.In(nameof(Messages.TooManyLoginAttempts), English)!, body);
    }

    /// <remarks>
    /// Case is the one spelling difference SQL Server folds away, so the lookup
    /// finds the same user either way. Keying the throttle on what was typed
    /// would hand an attacker a fresh allowance per capitalisation.
    /// </remarks>
    [Fact]
    public async Task ChangingTheCaseOfTheEmail_DoesNotMintANewAllowance()
    {
        var client = factory.CreateClient();
        var email = FreshEmail();

        for (var i = 0; i <= AccountLimit; i++)
        {
            using var _ = await AttemptAsync(client, email, "wrong");
        }

        using var throttled = await AttemptAsync(client, email.ToUpperInvariant(), "wrong");

        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
    }

    /// <summary>
    /// Every spelling of one real account draws on one budget — and so does the
    /// same spelling of an account that does not exist.
    /// </summary>
    /// <remarks>
    /// This is the branch the test above cannot reach: an email nobody owns is
    /// keyed on what was typed, while one that exists is keyed on what is stored.
    /// If those two derivations disagreed, eleven requests would answer whether
    /// an account exists — ten at an invisibly-different spelling, then one at
    /// the plain one, and 429 would mean the database folded them together while
    /// 401 would mean it had nothing to fold. So the key normalization has to
    /// chase the collation: case, and characters that are weighed as nothing.
    /// </remarks>
    [Fact]
    public async Task DifferentSpellingsOfOneRealAccount_ShareItsBudget()
    {
        var client = factory.CreateClient();
        var email = await factory.CreateThrowawayUserAsync();

        string[] spellings =
        [
            // Case: the collation folds it, so the lookup finds the same row.
            email.ToUpperInvariant(),
            // A soft hyphen: invisible, and weightless to the collation.
            email.Insert(1, "\u00AD"),
            // The same character hiding a trailing space from a leading trim —
            // strip it and the space is exposed, and SQL Server ignores trailing
            // spaces, so the row still matches while the key would not.
            email + " \u00AD",
            // And a no-break space, which normalization maps onto a plain one.
            email + "\u00A0\u00AD",
        ];

        for (var i = 0; i < AccountLimit; i++)
        {
            using var rejected = await AttemptAsync(client, spellings[i % spellings.Length], "wrong");
            Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        }

        using var throttled = await AttemptAsync(client, email, "wrong");
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
    }

    /// <remarks>
    /// The only email rule in the app that had no length cap, on the one endpoint
    /// that is anonymous — and the throttle would have retained whatever came
    /// through as a dictionary key for an hour.
    /// </remarks>
    [Fact]
    public async Task AnAbsurdlyLongEmail_IsRefusedBeforeItBecomesAKey()
    {
        var client = factory.CreateClient();

        using var response = await AttemptAsync(client, new string('a', 400) + "@example.com", "wrong");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
