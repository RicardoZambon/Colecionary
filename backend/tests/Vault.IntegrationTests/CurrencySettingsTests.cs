using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Vault.Application.Collections.Dtos;
using Vault.Application.Tenants;

namespace Vault.IntegrationTests;

/// <summary>
/// The account currency and the per-collection override, end to end.
/// </summary>
[Collection(nameof(ApiCollection))]
public class CurrencySettingsTests(VaultApiFactory factory)
{
    [Fact]
    public async Task Settings_StartOnTheFallbackCurrency()
    {
        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var settings = await marcus.GetFromJsonAsync<TenantSettingsDto>("/api/tenant/settings");
        Assert.NotNull(settings);
        Assert.Equal("USD", settings.DefaultCurrency);
    }

    [Fact]
    public async Task AnOwnerCanChangeTheAccountCurrency()
    {
        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        try
        {
            var response = await marcus.PutAsJsonAsync("/api/tenant/settings", new TenantSettingsDto("BRL"));
            response.EnsureSuccessStatusCode();

            var saved = await response.Content.ReadFromJsonAsync<TenantSettingsDto>();
            Assert.Equal("BRL", saved!.DefaultCurrency);

            // And it is the row that changed, not just the response.
            var reread = await marcus.GetFromJsonAsync<TenantSettingsDto>("/api/tenant/settings");
            Assert.Equal("BRL", reread!.DefaultCurrency);
        }
        finally
        {
            // Shared fixture: leaving the account in BRL would change what every
            // other test in this collection reads.
            await marcus.PutAsJsonAsync("/api/tenant/settings", new TenantSettingsDto("USD"));
        }
    }

    [Fact]
    public async Task AnUnsupportedCurrencyIsRejected()
    {
        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var response = await marcus.PutAsJsonAsync("/api/tenant/settings", new TenantSettingsDto("XYZ"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ANonOwnerCannotChangeTheAccountCurrency()
    {
        // It decides how every other member reads the vault, so it is Owner-only
        // like the member list.
        var ana = await factory.CreateAuthenticatedClientAsync("ana@example.com");
        var response = await ana.PutAsJsonAsync("/api/tenant/settings", new TenantSettingsDto("EUR"));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ACollectionOverrideRoundTrips_AndNullMeansFollowTheAccount()
    {
        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await (await marcus.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest("Currency round-trip", "")))
            .Content.ReadFromJsonAsync<CollectionDto>();
        Assert.NotNull(created);

        // A fresh collection inherits: no override at all.
        Assert.Null(created.Currency);

        try
        {
            var withOverride = await (await marcus.PutAsJsonAsync(
                $"/api/collections/{created.Id}",
                created with { Currency = "EUR" }))
                .Content.ReadFromJsonAsync<CollectionDto>();
            Assert.Equal("EUR", withOverride!.Currency);

            // Clearing it has to be expressible, or a collection could never go
            // back to following the account.
            var cleared = await (await marcus.PutAsJsonAsync(
                $"/api/collections/{created.Id}",
                withOverride with { Currency = null }))
                .Content.ReadFromJsonAsync<CollectionDto>();
            Assert.Null(cleared!.Currency);

            var stored = await factory.QueryDbAsync(db => db.Collections
                .IgnoreQueryFilters()
                .Where(c => c.Id == created.Id)
                .Select(c => c.Currency)
                .FirstOrDefaultAsync());
            Assert.Null(stored);
        }
        finally
        {
            await marcus.DeleteAsync($"/api/collections/{created.Id}");
        }
    }

    [Fact]
    public async Task AnUnsupportedCollectionOverrideIsRejected()
    {
        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await (await marcus.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest("Currency rejection", "")))
            .Content.ReadFromJsonAsync<CollectionDto>();
        Assert.NotNull(created);

        try
        {
            // A symbol, not an ISO 4217 code.
            var response = await marcus.PutAsJsonAsync(
                $"/api/collections/{created.Id}",
                created with { Currency = "US$" });
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally
        {
            await marcus.DeleteAsync($"/api/collections/{created.Id}");
        }
    }
}
