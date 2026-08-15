using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Vault.Application.Auth;
using Vault.Application.Resources;

namespace Vault.IntegrationTests;

/// <summary>
/// Proves the API answers in the language the client asks for.
///
/// <para>
/// Unit tests already pin the resources themselves; what only an end-to-end
/// request can show is that <c>UseRequestLocalization</c> actually sits where it
/// has to. The ProblemDetails title in particular is built by
/// <c>GlobalExceptionHandler</c> while the exception unwinds — if the
/// localization middleware were registered inside the exception handler instead
/// of outside it, the culture would already be gone by then and the title would
/// come back English however the client asked. These tests fail if anyone
/// reorders that.
/// </para>
/// </summary>
[Collection(nameof(ApiCollection))]
public class LocalizationTests(VaultApiFactory factory)
{
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en");
    private static readonly CultureInfo Portuguese = CultureInfo.GetCultureInfo("pt-BR");

    private static string Expect(string name, CultureInfo culture) => Messages.In(name, culture)!;

    /// <summary>
    /// Importing an unknown store listing is the cheapest request that reaches a
    /// <c>NotFoundException</c> — an unknown <c>/api/collections/{id}</c> has no
    /// route at all and 404s at the SPA fallback with an empty body, which would
    /// make these assertions vacuously pass on an empty string.
    /// </summary>
    private const string MissingListing = "/api/collections/import/does-not-exist";

    [Fact]
    public async Task NotFoundDetail_FollowsAcceptLanguage()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");

        client.DefaultRequestHeaders.AcceptLanguage.Clear();
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("pt-BR");
        var portuguese = await client.PostAsync(MissingListing, null);
        Assert.Equal(HttpStatusCode.NotFound, portuguese.StatusCode);
        var ptBody = await portuguese.Content.ReadAsStringAsync();

        client.DefaultRequestHeaders.AcceptLanguage.Clear();
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en");
        var english = await client.PostAsync(MissingListing, null);
        var enBody = await english.Content.ReadAsStringAsync();

        Assert.NotEqual(enBody, ptBody);
        // The id is data — it appears verbatim in both.
        Assert.Contains("does-not-exist", ptBody);
        Assert.Contains("does-not-exist", enBody);
    }

    [Fact]
    public async Task ProblemDetailsTitle_IsLocalized_WhichMeansTheMiddlewareRunsOutsideTheHandler()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("pt-BR");

        var response = await client.PostAsync(MissingListing, null);
        var body = await response.Content.ReadAsStringAsync();

        Assert.Contains(Expect(nameof(Messages.ProblemNotFound), Portuguese), body);
        Assert.DoesNotContain(Expect(nameof(Messages.ProblemNotFound), English), body);
    }

    [Fact]
    public async Task UnauthenticatedLogin_IsLocalizedToo()
    {
        // No token, no user — this path can only know the language from the header.
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("pt-BR");

        var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new LoginRequest("marcus@example.com", "wrong"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains(
            Expect(nameof(Messages.InvalidCredentials), Portuguese),
            await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task NoAcceptLanguage_FallsBackToEnglish()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        client.DefaultRequestHeaders.AcceptLanguage.Clear();

        var body = await (await client.PostAsync(MissingListing, null))
            .Content.ReadAsStringAsync();

        Assert.Contains(Expect(nameof(Messages.ProblemNotFound), English), body);
    }

    [Fact]
    public async Task AnUnsupportedLanguage_FallsBackToEnglish()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("de-DE");

        var body = await (await client.PostAsync(MissingListing, null))
            .Content.ReadAsStringAsync();

        Assert.Contains(Expect(nameof(Messages.ProblemNotFound), English), body);
    }
}
