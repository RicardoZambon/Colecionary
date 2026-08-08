using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vault.Application.Abstractions;
using Vault.Application.Auth;
using Vault.Domain.Entities;
using Vault.Domain.Enums;
using Vault.Infrastructure.Persistence;

namespace Vault.IntegrationTests;

/// <summary>
/// Boots the real API against a throwaway SQL Server container. The app's own
/// startup seeding populates the demo tenant; <see cref="EnsureSecondTenantAsync"/>
/// adds a second tenant ("globex") for isolation tests.
/// </summary>
public sealed class VaultApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string DemoPassword = "vault-demo";
    public const string GlobexOwnerEmail = "gary@globex.com";

    private readonly MsSqlContainer _sqlServer = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Vault", _sqlServer.GetConnectionString());
        builder.UseSetting("Seed:Enabled", "true");
        builder.UseSetting("Seed:DemoPassword", DemoPassword);
        builder.UseSetting("Jwt:SigningKey", "integration-test-signing-key-0123456789abcdef");
    }

    public async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password = DemoPassword)
    {
        var client = CreateClient();
        var login = await LoginAsync(client, email, password);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.Token);
        return client;
    }

    public static async Task<LoginResponse> LoginAsync(HttpClient client, string email, string password)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<LoginResponse>())!;
    }

    public async Task EnsureSecondTenantAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VaultDbContext>();
        if (await db.Tenants.AnyAsync(t => t.Slug == "globex"))
        {
            return;
        }

        var tenantId = Guid.NewGuid();
        db.Tenants.Add(new Tenant { Id = tenantId, Slug = "globex", Name = "Globex" });

        var owner = new User
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Email = GlobexOwnerEmail,
            Name = "Gary Globex",
            Initials = "GG",
            Role = MemberRole.Owner,
            Plan = PlanId.Free,
        };
        owner.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordService>().Hash(owner, DemoPassword);
        db.Users.Add(owner);
        await db.SaveChangesAsync();
    }

    /// <summary>Unfiltered database access for direct assertions.</summary>
    public async Task<T> QueryDbAsync<T>(Func<VaultDbContext, Task<T>> query)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VaultDbContext>();
        return await query(db);
    }

    public string ConnectionString => _sqlServer.GetConnectionString();

    async Task IAsyncLifetime.InitializeAsync()
    {
        await _sqlServer.StartAsync();
        // Program.cs decides setup-vs-configured from configuration read before the
        // host is built, so the connection string must be visible that early. An
        // environment variable is present from WebApplication.CreateBuilder onward.
        Environment.SetEnvironmentVariable("ConnectionStrings__Vault", _sqlServer.GetConnectionString());
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _sqlServer.DisposeAsync();
    }
}
