using Vault.Application.Collections.Dtos;
using Vault.Application.Collections.Validators;

namespace Vault.UnitTests;

public class ValidatorTests
{
    private static ItemDto ValidItem() =>
        new("i1", "NES", "desc", 1985, 340, "Nintendo", ["boxed"], "nes.jpg", [],
            [new ItemCopyDto("i1_c1", "Mint", 260)]);

    [Fact]
    public void ItemValidator_AcceptsAValidItem()
    {
        var result = new ItemDtoValidator().Validate(ValidItem());
        Assert.True(result.IsValid);
    }

    [Fact]
    public void ItemValidator_AcceptsAnItemWithNoCopies()
    {
        // No copies at all is the wantlist, not an invalid item.
        var result = new ItemDtoValidator().Validate(ValidItem() with { Copies = [] });
        Assert.True(result.IsValid);
    }

    [Theory]
    [InlineData("Sealed")]
    [InlineData("")]
    [InlineData("mint!")]
    public void ItemValidator_RejectsUnknownConditions(string condition)
    {
        var item = ValidItem() with { Copies = [new ItemCopyDto("i1_c1", condition, 260)] };
        Assert.False(new ItemDtoValidator().Validate(item).IsValid);
    }

    [Theory]
    [InlineData("Sold")]
    [InlineData("")]
    [InlineData("keep!")]
    public void ItemValidator_RejectsUnknownCopyStatus(string status)
    {
        var item = ValidItem() with { Copies = [new ItemCopyDto("i1_c1", "Mint", 260, Status: status)] };
        Assert.False(new ItemDtoValidator().Validate(item).IsValid);
    }

    [Theory]
    [InlineData("Keep")]
    [InlineData("ForTrade")]
    [InlineData("ForSale")]
    public void ItemValidator_AcceptsEveryCopyStatus(string status)
    {
        var item = ValidItem() with { Copies = [new ItemCopyDto("i1_c1", "Mint", 260, Status: status)] };
        Assert.True(new ItemDtoValidator().Validate(item).IsValid);
    }

    [Fact]
    public void ItemValidator_RejectsNegativeMoneyAndBadIds()
    {
        var validator = new ItemDtoValidator();
        Assert.False(validator.Validate(ValidItem() with { Value = -1 }).IsValid);
        Assert.False(validator.Validate(ValidItem() with
        {
            Copies = [new ItemCopyDto("i1_c1", "Mint", -0.01m)],
        }).IsValid);
        Assert.False(validator.Validate(ValidItem() with { Id = "has spaces" }).IsValid);
        Assert.False(validator.Validate(ValidItem() with { Id = new string('x', 65) }).IsValid);
    }

    [Fact]
    public void ItemValidator_AllowsNullCopyValue_RejectsNegative()
    {
        var validator = new ItemDtoValidator();
        // Null means "fall back to the item's reference value".
        Assert.True(validator.Validate(ValidItem() with
        {
            Copies = [new ItemCopyDto("i1_c1", "Mint", 260, Value: null)],
        }).IsValid);
        Assert.True(validator.Validate(ValidItem() with
        {
            Copies = [new ItemCopyDto("i1_c1", "Mint", 260, Value: 0)],
        }).IsValid);
        Assert.False(validator.Validate(ValidItem() with
        {
            Copies = [new ItemCopyDto("i1_c1", "Mint", 260, Value: -1)],
        }).IsValid);
    }

    [Fact]
    public void ItemValidator_RejectsDuplicateCopyIds()
    {
        var item = ValidItem() with
        {
            Copies = [new ItemCopyDto("dupe", "Mint", 10), new ItemCopyDto("dupe", "Fair", 5)],
        };
        Assert.False(new ItemDtoValidator().Validate(item).IsValid);
    }

    [Fact]
    public void ItemValidator_RejectsBadCopyIds()
    {
        var validator = new ItemDtoValidator();
        Assert.False(validator.Validate(ValidItem() with
        {
            Copies = [new ItemCopyDto("has spaces", "Mint", 10)],
        }).IsValid);
        Assert.False(validator.Validate(ValidItem() with
        {
            Copies = [new ItemCopyDto(new string('x', 65), "Mint", 10)],
        }).IsValid);
    }

    [Fact]
    public void ItemValidator_CapsCopiesAtFifty()
    {
        var validator = new ItemDtoValidator();
        ItemDto WithCopies(int count) => ValidItem() with
        {
            Copies = [.. Enumerable.Range(0, count).Select(i => new ItemCopyDto($"c{i}", "Good", 1))],
        };
        Assert.True(validator.Validate(WithCopies(50)).IsValid);
        Assert.False(validator.Validate(WithCopies(51)).IsValid);
    }

    [Fact]
    public void ItemValidator_RejectsOverlongNotes()
    {
        var item = ValidItem() with
        {
            Copies = [new ItemCopyDto("i1_c1", "Mint", 260, Notes: new string('x', 1001))],
        };
        Assert.False(new ItemDtoValidator().Validate(item).IsValid);
    }

    [Fact]
    public void ItemValidator_ConstrainsAcquiredOn()
    {
        var validator = new ItemDtoValidator();
        Assert.True(validator.Validate(ValidItem() with
        {
            Copies = [new ItemCopyDto("i1_c1", "Mint", 260, AcquiredOn: new DateOnly(2024, 3, 11))],
        }).IsValid);
        Assert.True(validator.Validate(ValidItem() with
        {
            Copies = [new ItemCopyDto("i1_c1", "Mint", 260, AcquiredOn: null)],
        }).IsValid);
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
