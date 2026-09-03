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
    public void ToDto_RoundTripsTypedFieldsAndSort()
    {
        var group = new Group
        {
            Id = "revistas",
            Name = "Revistas",
            Fields =
            [
                new GroupField { Name = "Número", Type = GroupFieldType.Number },
                new GroupField { Name = "Editora" },
            ],
            SortBy = "field:Número",
            SortDirection = "asc",
        };

        var dto = group.ToDto();

        // The wire form is lowercase, matching the frontend's GroupFieldType.
        Assert.Equal([("Número", "number"), ("Editora", "text")], dto.Fields.Select(f => (f.Name, f.Type)));
        Assert.Equal(new GroupSortDto("field:Número", "asc"), dto.Sort);

        var roundTripped = dto.ToEntity("c1", Guid.NewGuid(), 0);
        Assert.Equal(
            group.Fields.Select(f => (f.Name, f.Type)),
            roundTripped.Fields.Select(f => (f.Name, f.Type)));
        Assert.Equal("field:Número", roundTripped.SortBy);
        Assert.Equal("asc", roundTripped.SortDirection);
    }

    [Fact]
    public void GroupWithNoSort_TravelsAsNull_AndComesBackUnset()
    {
        var dto = new Group { Id = "g", Name = "G" }.ToDto();
        Assert.Null(dto.Sort);

        var entity = dto.ToEntity("c1", Guid.NewGuid(), 0);
        Assert.Null(entity.SortBy);
        Assert.Null(entity.SortDirection);
    }

    [Fact]
    public void GroupTarget_RoundTripsBothWays()
    {
        var dto = new Group { Id = "g", Name = "G", Target = 120 }.ToDto();
        Assert.Equal(120, dto.Target);

        var entity = dto.ToEntity("c1", Guid.NewGuid(), 0);
        Assert.Equal(120, entity.Target);
    }

    [Fact]
    public void GroupWithNoTarget_TravelsAsNull_AndComesBackUnset()
    {
        // Null is "no series size declared". A zero would claim the group is a
        // set of nothing, which is a different — and wrong — statement.
        var dto = new Group { Id = "g", Name = "G" }.ToDto();
        Assert.Null(dto.Target);

        var entity = dto.ToEntity("c1", Guid.NewGuid(), 0);
        Assert.Null(entity.Target);
    }

    [Fact]
    public void SortByWithoutADirection_DefaultsToAscending()
    {
        // Half a configuration would otherwise reach the client as a sort with
        // an empty direction, which no comparator knows how to apply.
        var dto = new Group { Id = "g", Name = "G", SortBy = "name" }.ToDto();
        Assert.Equal(new GroupSortDto("name", "asc"), dto.Sort);
    }

    [Fact]
    public void ParseHelpers_AreCaseInsensitive_AndRejectUnknowns()
    {
        Assert.Equal(Condition.Fair, DtoMapper.ParseCondition("fair"));
        Assert.Equal(CopyStatus.ForTrade, DtoMapper.ParseCopyStatus("fortrade"));
        Assert.Equal(MemberRole.Owner, DtoMapper.ParseRole("OWNER"));
        Assert.Equal(PlanId.Pro, DtoMapper.ParsePlan("pro"));
        Assert.Equal(GroupFieldType.Number, DtoMapper.ParseGroupFieldType("NUMBER"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParseCondition("Sealed"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParseCopyStatus("Gifted"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParsePlan("enterprise"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParseGroupFieldType("currency"));
        Assert.Equal(FieldScope.Copy, DtoMapper.ParseFieldScope("COPY"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParseFieldScope("exemplar"));
    }

    [Fact]
    public void AFieldWithNoScopeOnTheWire_ReadsAsItemScoped()
    {
        // The archive format is this DTO, so an export taken before scopes
        // existed arrives with the property absent. Absent has to mean "item" —
        // which is what those fields have always been — and never null, or
        // every restored collection would fail validation on a field nobody
        // ever chose a scope for.
        var dto = new GroupFieldDto("Serial no.", "text");

        Assert.Equal("item", dto.Scope);
        Assert.Equal(FieldScope.Item, dto.ToEntity().Scope);
    }

    [Fact]
    public void ScopeRoundTripsThroughBothDirections()
    {
        var field = new GroupField
        {
            Name = "Box condition",
            Type = GroupFieldType.Text,
            Scope = FieldScope.Copy,
        };

        var dto = field.ToDto();

        // Lower-cased on the wire, like every other enum-ish value, so the
        // Angular union type stays 'item' | 'copy' and never has to normalise.
        Assert.Equal("copy", dto.Scope);
        Assert.Equal(FieldScope.Copy, dto.ToEntity().Scope);
    }

    [Fact]
    public void ACollectionsOwnFieldsTravelBesideItsGroups()
    {
        var collection = new Collection
        {
            Id = "c1",
            Name = "Test",
            Fields = [new GroupField { Name = "Shelf", Scope = FieldScope.Item }],
            Groups = [new Group { Id = "g", Name = "G" }],
        };

        var dto = collection.ToDto();

        Assert.Equal(["Shelf"], dto.Fields.Select(f => f.Name));
        // And a document that never mentioned them restores as a collection
        // with none, rather than failing — same bargain as Sections.
        Assert.Empty(new CollectionDto("c2", "T", "", [], [], [], true).Fields);
    }

    [Fact]
    public void ACopysOwnValuesRoundTrip()
    {
        var copy = new ItemCopy
        {
            Id = "c1",
            Custom = [new CustomFieldValue { Key = "Box condition", Value = "No box" }],
        };

        var dto = copy.ToDto();

        Assert.Equal("No box", Assert.Single(dto.Custom).Value);
        Assert.Equal("No box", Assert.Single(dto.ToEntity().Custom).Value);
        // Absent on the wire is an empty list, never null: a copy written before
        // per-copy fields existed has no values, which is not the same as an
        // unreadable one.
        Assert.Empty(new ItemCopyDto("c2", "Mint", 0).Custom);
    }

    [Fact]
    public void ToProfileDto_LowercasesThePlan()
    {
        var user = new User { Name = "Marcus", Email = "m@x.com", Initials = "MK", Plan = PlanId.Pro };
        Assert.Equal("pro", user.ToProfileDto().Plan);
    }
}
