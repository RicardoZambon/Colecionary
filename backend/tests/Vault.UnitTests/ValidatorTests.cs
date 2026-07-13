using Vault.Application.Collections.Dtos;
using Vault.Application.Collections.Validators;

namespace Vault.UnitTests;

public class ValidatorTests
{
    private static ItemDto ValidItem() =>
        new("i1", "NES", "desc", 1985, "Mint", 340, 260, "Nintendo", ["boxed"], "nes.jpg", [], true);

    [Fact]
    public void ItemValidator_AcceptsAValidItem()
    {
        var result = new ItemDtoValidator().Validate(ValidItem());
        Assert.True(result.IsValid);
    }

    [Theory]
    [InlineData("Sealed")]
    [InlineData("")]
    [InlineData("mint!")]
    public void ItemValidator_RejectsUnknownConditions(string condition)
    {
        var result = new ItemDtoValidator().Validate(ValidItem() with { Condition = condition });
        Assert.False(result.IsValid);
    }

    [Fact]
    public void ItemValidator_RejectsNegativeMoneyAndBadIds()
    {
        var validator = new ItemDtoValidator();
        Assert.False(validator.Validate(ValidItem() with { Value = -1 }).IsValid);
        Assert.False(validator.Validate(ValidItem() with { Price = -0.01m }).IsValid);
        Assert.False(validator.Validate(ValidItem() with { Id = "has spaces" }).IsValid);
        Assert.False(validator.Validate(ValidItem() with { Id = new string('x', 65) }).IsValid);
    }

    [Fact]
    public void MemberValidator_ConstrainsRoleAndEmail()
    {
        var validator = new MemberDtoValidator();
        Assert.True(validator.Validate(new MemberDto("Ana", "ana@airia.com", "AP", "Editor")).IsValid);
        Assert.False(validator.Validate(new MemberDto("Ana", "not-an-email", "AP", "Editor")).IsValid);
        Assert.False(validator.Validate(new MemberDto("Ana", "ana@airia.com", "AP", "Admin")).IsValid);
    }
}
