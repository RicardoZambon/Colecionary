namespace Vault.Application.Tenants;

/// <summary>
/// Account-wide settings. Mirrors the frontend's <c>TenantSettings</c>.
/// </summary>
/// <param name="DefaultCurrency">
/// ISO 4217 code every amount is read in unless a collection overrides it.
/// Never null: see <see cref="Vault.Domain.Entities.Tenant.DefaultCurrency"/>.
/// </param>
public sealed record TenantSettingsDto(string DefaultCurrency);
