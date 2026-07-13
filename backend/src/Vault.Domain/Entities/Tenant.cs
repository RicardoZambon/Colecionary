namespace Vault.Domain.Entities;

public class Tenant
{
    public Guid Id { get; set; }

    /// <summary>URL-safe identifier, e.g. "acme-vault". Unique.</summary>
    public string Slug { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;
}
