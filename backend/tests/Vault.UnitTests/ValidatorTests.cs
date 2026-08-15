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

    private static GroupNodeDto ValidGroup() =>
        new("Marvel", "Marvel", null, [new GroupFieldDto("Issue", "number")]);

    [Fact]
    public void GroupValidator_AcceptsANullTarget()
    {
        // No declared series size: progress falls back to what is catalogued.
        Assert.True(new GroupNodeDtoValidator().Validate(ValidGroup()).IsValid);
    }

    [Fact]
    public void GroupValidator_AcceptsAPositiveTarget()
    {
        var group = ValidGroup() with { Target = 120 };
        Assert.True(new GroupNodeDtoValidator().Validate(group).IsValid);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(100_001)]
    public void GroupValidator_RejectsImplausibleTargets(int target)
    {
        // Zero is not a series — null is the one way to say "unset" — and the
        // ceiling stops a mistyped paste from producing nonsense progress.
        var group = ValidGroup() with { Target = target };
        Assert.False(new GroupNodeDtoValidator().Validate(group).IsValid);
    }

    [Fact]
    public void GroupValidator_AcceptsATargetBelowTheItemsAlreadyCatalogued()
    {
        // This test exists to pin a DECISION, not just a behaviour. Groups and
        // items arrive in the same full-document PUT, so cross-checking the
        // target against the item count would make declaring a target before
        // cataloguing impossible and would block the entire collection from
        // saving. The overrun is shown in the UI, never rejected here.
        var collection = new CollectionDto(
            "comics", "Comics", "",
            [ValidGroup() with { Target = 2 }],
            [
                ValidItem() with { Id = "i1", GroupId = "Marvel" },
                ValidItem() with { Id = "i2", GroupId = "Marvel" },
                ValidItem() with { Id = "i3", GroupId = "Marvel" },
            ],
            [],
            true);

        var validator = new CollectionDtoValidator(
            new GroupNodeDtoValidator(), new ItemDtoValidator(), new MemberDtoValidator());

        Assert.True(validator.Validate(collection).IsValid);
    }

    [Fact]
    public void MemberValidator_ConstrainsRoleAndEmail()
    {
        var validator = new MemberDtoValidator();
        Assert.True(validator.Validate(new MemberDto("Ana", "ana@example.com", "AP", "Editor")).IsValid);
        Assert.False(validator.Validate(new MemberDto("Ana", "not-an-email", "AP", "Editor")).IsValid);
        Assert.False(validator.Validate(new MemberDto("Ana", "ana@example.com", "AP", "Admin")).IsValid);
    }
}
