using Vault.Domain.ValueObjects;

namespace Vault.Domain.Entities;

public class Tenant
{
    public Guid Id { get; set; }

    /// <summary>URL-safe identifier, e.g. "acme-vault". Unique.</summary>
    public string Slug { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    /// <summary>Default UI theme chosen at first-run setup (a theme id, e.g. "devlight"). Null = client default.</summary>
    public string? DefaultTheme { get; set; }

    /// <summary>
    /// ISO 4217 code every amount in this vault is read in ("USD", "BRL") —
    /// the account-wide default a collection may override.
    /// </summary>
    /// <remarks>
    /// Never null, unlike <see cref="DefaultTheme"/>. A theme has a sane client
    /// default; a currency does not — rendering an amount under the wrong
    /// symbol restates it as a different amount of money, so there has to be an
    /// answer here rather than one guessed downstream.
    /// </remarks>
    public string DefaultCurrency { get; set; } = Money.FallbackCurrency;
}
