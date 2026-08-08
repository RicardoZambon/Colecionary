using Vault.Application.Collections.Dtos;
using Vault.Application.Common;
using Vault.Domain.Entities;
using Vault.Domain.Enums;
using Vault.Domain.ValueObjects;

namespace Vault.UnitTests;

public class DtoMapperTests
{
    [Fact]
    public void ToDto_OrdersGroupsAndItemsBySortOrder()
    {
        var collection = new Collection
        {
            Id = "c1",
            Name = "Test",
            Groups =
            [
                new Group { Id = "b", Name = "B", SortOrder = 1 },
                new Group { Id = "a", Name = "A", SortOrder = 0 },
            ],
            Items =
            [
                new Item { Id = "late", Name = "Late", SortOrder = 5 },
                new Item
                {
                    Id = "early",
                    Name = "Early",
                    SortOrder = 0,
                    Copies = [new ItemCopy { Id = "early_c1", Condition = Condition.Mint, Price = 10 }],
                },
            ],
        };

        var dto = collection.ToDto();

        Assert.Equal(["a", "b"], dto.Groups.Select(g => g.Id));
        Assert.Equal(["early", "late"], dto.Items.Select(i => i.Id));
        Assert.Equal("Mint", dto.Items[0].Copies[0].Condition);
    }

    [Fact]
    public void EmptyCopies_MeansWantlist()
    {
        var dto = new Item { Id = "wanted", Name = "Grail" }.ToDto();
        Assert.Empty(dto.Copies);
    }

    [Fact]
    public void ToEntity_MapsEveryCopyField()
    {
        var dto = new ItemDto("i1", "NES", "desc", 1985, 340, "Nintendo", [], "nes.jpg", [],
            [new ItemCopyDto("i1_c1", "fair", 12.5m, 99m, new DateOnly(2019, 5, 4), "ForSale", "boxed")]);

        var copy = Assert.Single(dto.ToEntity("retro", Guid.NewGuid(), 0, DateTimeOffset.UtcNow).Copies);

        Assert.Equal("i1_c1", copy.Id);
        Assert.Equal(Condition.Fair, copy.Condition);
        Assert.Equal(12.5m, copy.Price);
        Assert.Equal(99m, copy.Value);
        Assert.Equal(new DateOnly(2019, 5, 4), copy.AcquiredOn);
        Assert.Equal(CopyStatus.ForSale, copy.Status);
        Assert.Equal("boxed", copy.Notes);
    }

    [Fact]
    public void ToDto_RoundTripsCopies()
    {
        var item = new Item
        {
            Id = "i1",
            Name = "NES",
            Copies =
            [
                new ItemCopy { Id = "a", Condition = Condition.Mint, Price = 1 },
                new ItemCopy
                {
                    Id = "b",
                    Condition = Condition.Fair,
                    Price = 2,
                    Value = 3,
                    AcquiredOn = new DateOnly(2020, 1, 2),
                    Status = CopyStatus.ForTrade,
                    Notes = "spare",
                },
            ],
        };

        var roundTripped = item.ToDto().ToEntity("c", Guid.NewGuid(), 0, DateTimeOffset.UtcNow);

        Assert.Equal(
            item.Copies.Select(c => (c.Id, c.Condition, c.Price, c.Value, c.AcquiredOn, c.Status, c.Notes)),
            roundTripped.Copies.Select(c => (c.Id, c.Condition, c.Price, c.Value, c.AcquiredOn, c.Status, c.Notes)));
    }

    [Fact]
    public void ApplyTo_ReplacesEveryCopyField()
    {
        // The update path used by the item PUT. A field missed here saves with
        // 200 and silently loses the edit.
        var item = new Item
        {
            Id = "i1",
            Name = "Old",
            Copies =
            [
                new ItemCopy { Id = "gone", Condition = Condition.Mint, Price = 1 },
                new ItemCopy { Id = "also-gone", Condition = Condition.Good, Price = 2 },
            ],
        };

        var dto = new ItemDto("i1", "New", "desc", 1985, 340, "Nintendo", [], "nes.jpg", [],
        [
            new ItemCopyDto("keep", "Mint", 10, null, null, "Keep", ""),
            new ItemCopyDto("trade", "Good", 20, 25m, new DateOnly(2021, 7, 1), "ForTrade", "duplicate"),
            new ItemCopyDto("sell", "Fair", 30, 15m, new DateOnly(2022, 8, 2), "ForSale", "rough"),
        ]);

        dto.ApplyTo(item);

        Assert.Equal(["keep", "trade", "sell"], item.Copies.Select(c => c.Id));
        Assert.Equal([Condition.Mint, Condition.Good, Condition.Fair], item.Copies.Select(c => c.Condition));
        Assert.Equal([10m, 20m, 30m], item.Copies.Select(c => c.Price));
        Assert.Equal([null, 25m, 15m], item.Copies.Select(c => c.Value));
        Assert.Equal(
            [null, new DateOnly(2021, 7, 1), new DateOnly(2022, 8, 2)],
            item.Copies.Select(c => c.AcquiredOn));
        Assert.Equal(
            [CopyStatus.Keep, CopyStatus.ForTrade, CopyStatus.ForSale],
            item.Copies.Select(c => c.Status));
        Assert.Equal(["", "duplicate", "rough"], item.Copies.Select(c => c.Notes));
    }

    [Fact]
    public void ApplyTo_CanEmptyTheCopies_SendingAnItemBackToTheWantlist()
    {
        var item = new Item { Id = "i1", Copies = [new ItemCopy { Id = "c1" }] };
        var dto = new ItemDto("i1", "N", "d", 1985, 1, "g", [], "i.jpg", []);

        dto.ApplyTo(item);

        Assert.Empty(item.Copies);
    }

    [Fact]
    public void ParseHelpers_AreCaseInsensitive_AndRejectUnknowns()
    {
        Assert.Equal(Condition.Fair, DtoMapper.ParseCondition("fair"));
        Assert.Equal(CopyStatus.ForTrade, DtoMapper.ParseCopyStatus("fortrade"));
        Assert.Equal(MemberRole.Owner, DtoMapper.ParseRole("OWNER"));
        Assert.Equal(PlanId.Pro, DtoMapper.ParsePlan("pro"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParseCondition("Sealed"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParseCopyStatus("Gifted"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParsePlan("enterprise"));
    }

    [Fact]
    public void ToProfileDto_LowercasesThePlan()
    {
        var user = new User { Name = "Marcus", Email = "m@x.com", Initials = "MK", Plan = PlanId.Pro };
        Assert.Equal("pro", user.ToProfileDto().Plan);
    }
}
