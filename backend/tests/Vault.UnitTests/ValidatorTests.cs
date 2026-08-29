using System.Globalization;
using Vault.Application.Collections.Dtos;
using Vault.Application.Collections.Validators;
using Vault.Application.Resources;

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
            new GroupNodeDtoValidator(), new SectionDtoValidator(), new ItemDtoValidator(), new MemberDtoValidator());

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

    // --- sections ---

    [Fact]
    public void Section_NeedsAGroupToDivide()
    {
        var validator = new SectionDtoValidator();

        Assert.True(validator.Validate(new SectionDto("s1", "g1", "Bronze")).IsValid);
        // Unlike an item's GroupId, a section's is required: a divider that
        // belongs to nothing has nothing to divide.
        Assert.False(validator.Validate(new SectionDto("s1", string.Empty, "Bronze")).IsValid);
        Assert.False(validator.Validate(new SectionDto("s1", "g1", string.Empty)).IsValid);
        Assert.False(validator.Validate(new SectionDto("not an id", "g1", "Bronze")).IsValid);
    }

    [Fact]
    public void Section_TakesTheSameTargetRangeAsAGroup()
    {
        var validator = new SectionDtoValidator();

        Assert.True(validator.Validate(new SectionDto("s1", "g1", "Bronze", Target: null)).IsValid);
        Assert.True(validator.Validate(new SectionDto("s1", "g1", "Bronze", Target: 10)).IsValid);
        // Zero is not a series; null is already the single way to say "unset".
        Assert.False(validator.Validate(new SectionDto("s1", "g1", "Bronze", Target: 0)).IsValid);
    }

    [Fact]
    public void Section_ReferencingAGroupNotInThePayload_IsStillAccepted()
    {
        // Groups, sections and items all arrive in one document, so a reference
        // that dangles mid-edit is legal. It resolves to "no section" on read;
        // refusing it here would make ordinary intermediate states unsaveable.
        var collection = new CollectionDto(
            "c1",
            "Saint Seiya",
            string.Empty,
            [],
            [],
            [],
            LinkShare: true,
            Sections: [new SectionDto("s1", "gone", "Bronze")]);

        Assert.True(CollectionValidator().Validate(collection).IsValid);
    }

    [Fact]
    public void Section_IdsMustBeUniqueWithinACollection()
    {
        // The graph merge keys its replacement list by id, so a duplicate would
        // surface deep in persistence as a 500 instead of as the 400 it is.
        var collection = new CollectionDto(
            "c1",
            "Saint Seiya",
            string.Empty,
            [],
            [],
            [],
            LinkShare: true,
            Sections: [new SectionDto("s1", "g1", "Bronze"), new SectionDto("s1", "g1", "Prata")]);

        Assert.False(CollectionValidator().Validate(collection).IsValid);
    }

    // --- the group tree (a move is a UI feature; this is its server-side half) ---

    private static CollectionDto Tree(params GroupNodeDto[] groups) =>
        new("c1", "Comics", string.Empty, groups, [], [], LinkShare: true);

    [Fact]
    public void Groups_AcceptAWellFormedTree()
    {
        var collection = Tree(
            new GroupNodeDto("revistas", "Revistas", null, []),
            new GroupNodeDto("marvel", "Marvel", "revistas", []),
            new GroupNodeDto("ultimate", "Ultimate", "marvel", []));

        Assert.True(CollectionValidator().Validate(collection).IsValid);
    }

    [Fact]
    public void Groups_RejectAParentThatIsNotInThePayload()
    {
        // Deliberately unlike a section's or an item's reference, which are
        // allowed to dangle because they read as "none". A ParentId has no such
        // reading: the tree is walked down from the roots, so an orphaned branch
        // vanishes from the sidebar and from the parent picker while its items
        // still count in the collection's totals.
        var collection = Tree(new GroupNodeDto("marvel", "Marvel", "gone", []));

        var result = CollectionValidator().Validate(collection);

        Assert.False(result.IsValid);
        Assert.Contains(
            result.Errors,
            e => e.ErrorMessage == Messages.In(nameof(Messages.GroupParentMustExist), CultureInfo.CurrentUICulture));
    }

    [Fact]
    public void Groups_RejectAParentIdCycle()
    {
        var collection = Tree(
            new GroupNodeDto("a", "A", "b", []),
            new GroupNodeDto("b", "B", "a", []));

        var result = CollectionValidator().Validate(collection);

        Assert.False(result.IsValid);
        Assert.Contains(
            result.Errors,
            e => e.ErrorMessage == Messages.In(nameof(Messages.GroupParentCycle), CultureInfo.CurrentUICulture));
    }

    [Fact]
    public void Groups_RejectAGroupThatIsItsOwnParent()
    {
        var collection = Tree(new GroupNodeDto("a", "A", "a", []));

        Assert.False(CollectionValidator().Validate(collection).IsValid);
    }

    [Fact]
    public void Groups_RejectALoopThatNoRootReaches()
    {
        // The dangerous shape: a legitimate tree beside a two-group loop. Every
        // ParentId resolves, nothing is orphaned, and the loop is still
        // unreachable from any root.
        var collection = Tree(
            new GroupNodeDto("revistas", "Revistas", null, []),
            new GroupNodeDto("a", "A", "b", []),
            new GroupNodeDto("b", "B", "a", []));

        Assert.False(CollectionValidator().Validate(collection).IsValid);
    }

    [Fact]
    public void Groups_AnswerInThePtBrCultureWhenAsked()
    {
        // The messages are localized like every other one; the test goes through
        // the resource so it never becomes a second copy of the translation.
        var ptBr = new CultureInfo("pt-BR");
        Assert.NotNull(Messages.In(nameof(Messages.GroupParentCycle), ptBr));
        Assert.NotEqual(
            Messages.In(nameof(Messages.GroupParentCycle), CultureInfo.InvariantCulture),
            Messages.In(nameof(Messages.GroupParentCycle), ptBr));
    }

    private static CollectionDtoValidator CollectionValidator() =>
        new(
            new GroupNodeDtoValidator(),
            new SectionDtoValidator(),
            new ItemDtoValidator(),
            new MemberDtoValidator());
}
