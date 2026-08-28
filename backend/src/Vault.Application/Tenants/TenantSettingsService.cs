using FluentValidation;
using Vault.Application.Abstractions;
using Vault.Application.Common;
using Vault.Application.Resources;
using Vault.Domain.ValueObjects;

namespace Vault.Application.Tenants;

/// <summary>
/// Reads and writes the settings that belong to the account rather than to the
/// person signed in. Kept apart from <c>ProfileService</c> on purpose: a
/// currency stored per user would let two members of the same vault read the
/// same collection as two different amounts of money.
/// </summary>
public class TenantSettingsService(
    ITenantRepository tenants,
    ICurrentTenant currentTenant,
    IValidator<TenantSettingsDto> validator)
{
    public async Task<TenantSettingsDto> GetAsync(CancellationToken ct)
    {
        var tenant = await tenants.GetAsync(currentTenant.TenantId, ct)
            ?? throw new NotFoundException(Messages.TenantNotFound);
        return new TenantSettingsDto(tenant.DefaultCurrency);
    }

    public async Task<TenantSettingsDto> UpdateAsync(TenantSettingsDto dto, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(dto, ct);
        var tenant = await tenants.GetAsync(currentTenant.TenantId, ct)
            ?? throw new NotFoundException(Messages.TenantNotFound);

        tenant.DefaultCurrency = dto.DefaultCurrency;
        await tenants.SaveChangesAsync(ct);
        return new TenantSettingsDto(tenant.DefaultCurrency);
    }
}

public sealed class TenantSettingsDtoValidator : AbstractValidator<TenantSettingsDto>
{
    public TenantSettingsDtoValidator()
    {
        // No When(...) here, unlike the collection override: the account always
        // has a currency, so an absent one is a bad request rather than a
        // deliberate "follow something else".
        RuleFor(s => s.DefaultCurrency)
            .Must(Money.IsSupported)
            .WithMessage(_ => Messages.CurrencyInvalid);
    }
}
