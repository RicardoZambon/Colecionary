using Vault.Application.Collections.Dtos;
using Vault.Application.Collections.Validators;
using Vault.Application.Tenants;
using Vault.Domain.ValueObjects;

namespace Vault.UnitTests;

/// <summary>
/// The currency whitelist, from both ends: the account setting that must always
/// name one, and the collection override that may name none.
/// </summary>
public class CurrencyTests
{
    private static CollectionDto ValidCollection() =>
        new("c1", "Consoles", "desc", [], [], [], LinkShare: true);

    private static CollectionDtoValidator CollectionValidator() =>
        new(new GroupNodeDtoValidator(), new SectionDtoValidator(), new ItemDtoValidator(), new MemberDtoValidator());

    [Fact]
    public void Collection_WithoutAnOverride_IsValid()
    {
        // Null is "follow the account", which is the default state of every
        // collection — not an omission to be rejected.
        var result = CollectionValidator().Validate(ValidCollection() with { Currency = null });
        Assert.True(result.IsValid);
    }

    [Theory]
    [InlineData("USD")]
    [InlineData("BRL")]
    [InlineData("EUR")]
    public void Collection_AcceptsASupportedOverride(string code)
    {
        var result = CollectionValidator().Validate(ValidCollection() with { Currency = code });
        Assert.True(result.IsValid);
    }

    [Theory]
    [InlineData("")]          // empty is not "unset" — null is
    [InlineData("usd")]       // ISO 4217 codes are uppercase
    [InlineData("US$")]       // a symbol, not a code
    [InlineData("XYZ")]       // well-formed but not a currency we render
    [InlineData("DOLLAR")]
    public void Collection_RejectsAnUnsupportedOverride(string code)
    {
        var result = CollectionValidator().Validate(ValidCollection() with { Currency = code });
        Assert.False(result.IsValid);
    }

    [Fact]
    public void TenantSettings_RejectAnAbsentCurrency()
    {
        // Unlike the collection override, the account always has one: there is
        // nothing above it to inherit from.
        Assert.False(new TenantSettingsDtoValidator().Validate(new TenantSettingsDto("")).IsValid);
    }

    [Fact]
    public void TenantSettings_AcceptEverySupportedCode()
    {
        var validator = new TenantSettingsDtoValidator();
        Assert.All(
            Money.SupportedCurrencies,
            code => Assert.True(validator.Validate(new TenantSettingsDto(code)).IsValid, code));
    }

    [Fact]
    public void TheFallbackIsItselfSupported()
    {
        // Otherwise every unset tenant would land on a code its own validator
        // rejects, and the first save of any other setting would 400.
        Assert.True(Money.IsSupported(Money.FallbackCurrency));
    }

    [Fact]
    public void SupportedCodesAreThreeUppercaseLetters()
    {
        // The column is nvarchar(3); a longer code would be silently truncated
        // into one that no longer round-trips.
        Assert.All(Money.SupportedCurrencies, code =>
        {
            Assert.Equal(3, code.Length);
            Assert.Equal(code.ToUpperInvariant(), code);
        });
    }
}
