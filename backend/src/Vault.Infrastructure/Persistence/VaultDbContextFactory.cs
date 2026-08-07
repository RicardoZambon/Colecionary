using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Vault.Infrastructure.Persistence;

/// <summary>Used by `dotnet ef` commands only — never at runtime.</summary>
public sealed class VaultDbContextFactory : IDesignTimeDbContextFactory<VaultDbContext>
{
    public VaultDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<VaultDbContext>()
            .UseSqlServer("Server=umbrel.local,1433;Database=Vault_DEV;User Id=Vault;Password=Vault;TrustServerCertificate=true")
            .Options;
        return new VaultDbContext(options, NoOpCurrentTenant.Instance);
    }
}
