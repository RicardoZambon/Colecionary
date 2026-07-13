using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Vault.Infrastructure.Persistence;

/// <summary>Used by `dotnet ef` commands only — never at runtime.</summary>
public sealed class VaultDbContextFactory : IDesignTimeDbContextFactory<VaultDbContext>
{
    public VaultDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<VaultDbContext>()
            .UseNpgsql("Host=localhost;Port=5433;Database=vault;Username=vault;Password=vault")
            .Options;
        return new VaultDbContext(options, NoOpCurrentTenant.Instance);
    }
}
