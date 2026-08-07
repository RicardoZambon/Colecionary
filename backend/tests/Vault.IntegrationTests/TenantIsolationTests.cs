using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Vault.Application.Collections.Dtos;
using Vault.Domain.Entities;
using Vault.Infrastructure.Persistence;
using Vault.Infrastructure.Persistence.Interceptors;

namespace Vault.IntegrationTests;

[Collection(nameof(ApiCollection))]
public class TenantIsolationTests(VaultApiFactory factory)
{
    [Fact]
    public async Task ListCollections_OnlyReturnsOwnTenantsRows()
    {
        await factory.EnsureSecondTenantAsync();

        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@airia.com");
        var acme = await marcus.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        Assert.NotNull(acme);
        Assert.Contains(acme, c => c.Id == "retro");

        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);
        var globex = await gary.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        Assert.NotNull(globex);
        Assert.DoesNotContain(globex, c => c.Id == "retro");
    }

    [Fact]
    public async Task CrossTenantReadsAndWrites_Are404()
    {
        await factory.EnsureSecondTenantAsync();
        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);

        // "retro" belongs to acme-vault; the filter must hide it entirely.
        var update = new CollectionDto("retro", "Hijacked", "", [], [], [], true);
        var putResponse = await gary.PutAsJsonAsync("/api/collections/retro", update);
        Assert.Equal(HttpStatusCode.NotFound, putResponse.StatusCode);

        var deleteResponse = await gary.DeleteAsync("/api/collections/retro");
        Assert.Equal(HttpStatusCode.NotFound, deleteResponse.StatusCode);

        // And the row is untouched.
        var name = await factory.QueryDbAsync(db => db.Collections
            .IgnoreQueryFilters()
            .Where(c => c.Id == "retro")
            .Select(c => c.Name)
            .SingleAsync());
        Assert.Equal("Retro Consoles", name);
    }

    [Fact]
    public async Task BothTenantsCanImportTheSameStoreListing()
    {
        await factory.EnsureSecondTenantAsync();
        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@airia.com");
        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);

        var first = await marcus.PostAsync("/api/collections/import/store_gb", null);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await gary.PostAsync("/api/collections/import/store_gb", null);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);

        // Re-import must surface the exact toast message the frontend shows.
        var conflict = await marcus.PostAsync("/api/collections/import/store_gb", null);
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Contains("Already in your vault", await conflict.Content.ReadAsStringAsync());

        var rows = await factory.QueryDbAsync(db => db.Collections
            .IgnoreQueryFilters()
            .CountAsync(c => c.Id == "store_gb"));
        Assert.Equal(2, rows);
    }

    [Fact]
    public async Task CreatedCollections_AreStampedWithCallersTenant()
    {
        await factory.EnsureSecondTenantAsync();
        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);

        var response = await gary.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest("Gary's Gadgets", "isolated"));
        response.EnsureSuccessStatusCode();
        var created = (await response.Content.ReadFromJsonAsync<CollectionDto>())!;

        var (collectionTenant, globexTenant) = await factory.QueryDbAsync(async db =>
        {
            var tenant = await db.Collections.IgnoreQueryFilters()
                .Where(c => c.Id == created.Id)
                .Select(c => c.TenantId)
                .SingleAsync();
            var globex = await db.Tenants.Where(t => t.Slug == "globex").Select(t => t.Id).SingleAsync();
            return (tenant, globex);
        });
        Assert.Equal(globexTenant, collectionTenant);
    }

    [Fact]
    public async Task Interceptor_RejectsForeignTenantWrites()
    {
        var options = new DbContextOptionsBuilder<VaultDbContext>()
            .UseSqlServer(factory.ConnectionString)
            .AddInterceptors(new TenantStampingInterceptor(new FakeTenant(Guid.NewGuid())))
            .Options;

        await using var db = new VaultDbContext(options, new FakeTenant(Guid.NewGuid()));
        db.Collections.Add(new Collection { TenantId = Guid.NewGuid(), Id = "smuggled", Name = "Nope" });

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    private sealed class FakeTenant(Guid tenantId) : Application.Abstractions.ICurrentTenant
    {
        public bool IsAuthenticated => true;

        public Guid TenantId => tenantId;

        public Guid UserId => Guid.NewGuid();

        public string Role => "Owner";
    }
}
