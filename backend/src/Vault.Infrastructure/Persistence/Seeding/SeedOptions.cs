namespace Vault.Infrastructure.Persistence.Seeding;

public sealed class SeedOptions
{
    public const string SectionName = "Seed";

    /// <summary>Run migrations + demo seed at startup (Development only).</summary>
    public bool Enabled { get; set; }

    /// <summary>Password assigned to all demo users.</summary>
    public string DemoPassword { get; set; } = "vault-demo";
}
