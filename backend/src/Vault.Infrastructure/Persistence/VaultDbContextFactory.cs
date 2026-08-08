using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Vault.Infrastructure.Persistence;

/// <summary>Used by `dotnet ef` commands only — never at runtime.</summary>
public sealed class VaultDbContextFactory : IDesignTimeDbContextFactory<VaultDbContext>
{
    public VaultDbContext CreateDbContext(string[] args)
    {
        // `dotnet ef` design-time connection. Defaults to the local docker-compose
        // server; override per-developer with the ConnectionStrings__Vault env var.
        var connectionString =
            Environment.GetEnvironmentVariable("ConnectionStrings__Vault")
            ?? "Server=localhost,1433;Database=Vault_DEV;User Id=sa;Password=Your_strong_Pass123;TrustServerCertificate=true";

        var options = new DbContextOptionsBuilder<VaultDbContext>()
            .UseSqlServer(connectionString)
            .Options;
        return new VaultDbContext(options, NoOpCurrentTenant.Instance);
    }
}
