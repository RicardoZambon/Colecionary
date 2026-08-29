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

    /// <summary>
    /// Per-run image directory. An absolute path so it bypasses content-root
    /// resolution entirely — tests must never write uploads into the source tree.
    /// </summary>
    public string ImageRoot { get; } =
        Path.Combine(Path.GetTempPath(), $"vault-images-{Guid.NewGuid():N}");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Vault", _sqlServer.GetConnectionString());
        builder.UseSetting("Seed:Enabled", "true");
        builder.UseSetting("Seed:DemoPassword", DemoPassword);
        builder.UseSetting("Jwt:SigningKey", "integration-test-signing-key-0123456789abcdef");
        builder.UseSetting("ImageStorage:Root", ImageRoot);

        // The login throttle's per-account rule runs at its production settings
        // here — that is the rule an attacker meets, so it is the rule the suite
        // should meet too, and it costs nothing because a successful sign-in
        // refunds its charge and every test signs in successfully.
        //
        // The per-address rule is the one that cannot survive contact with a
        // shared TestServer: every request in the suite comes from the same
        // client (in fact from no address at all), so one class's deliberate
        // failures would be charged to the next class's login. It is raised out
        // of reach here and pinned deterministically in
        // Vault.UnitTests.LoginThrottleTests, where the address is a parameter.
        // Never do this in a real deployment: it is the half of the defence that
        // sees a password spray across many accounts.
        builder.UseSetting("LoginThrottle:MaxClientFailures", "1000000");
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

    /// <summary>
    /// Creates a user in a tenant of its own and returns its email.
    /// </summary>
    /// <remarks>
    /// A test that wants to throttle a <em>real</em> account cannot use a demo
    /// login — every other class signs in as those, and a five-minute penalty
    /// would look like a broken app. Its own tenant keeps it out of the demo
    /// tenant's member list too, which <c>ContractTests</c> reads and writes back.
    /// </remarks>
    public async Task<string> CreateThrowawayUserAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VaultDbContext>();

        var slug = $"throwaway-{Guid.NewGuid():N}";
        var tenantId = Guid.NewGuid();
        db.Tenants.Add(new Tenant { Id = tenantId, Slug = slug, Name = "Throwaway" });

        var user = new User
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Email = $"{slug}@example.com",
            Name = "Throwaway",
            Initials = "TA",
            Role = MemberRole.Owner,
            Plan = PlanId.Free,
        };
        user.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordService>().Hash(user, DemoPassword);
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Email;
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

        if (Directory.Exists(ImageRoot))
        {
            Directory.Delete(ImageRoot, recursive: true);
        }
    }
}
