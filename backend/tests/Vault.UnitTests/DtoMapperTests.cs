using Vault.Application.Common;
using Vault.Domain.Entities;
using Vault.Domain.Enums;

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
                new Item { Id = "late", Name = "Late", SortOrder = 5, Condition = Condition.Good },
                new Item { Id = "early", Name = "Early", SortOrder = 0, Condition = Condition.Mint },
            ],
        };

        var dto = collection.ToDto();

        Assert.Equal(["a", "b"], dto.Groups.Select(g => g.Id));
        Assert.Equal(["early", "late"], dto.Items.Select(i => i.Id));
        Assert.Equal("Mint", dto.Items[0].Condition);
    }

    [Fact]
    public void ParseHelpers_AreCaseInsensitive_AndRejectUnknowns()
    {
        Assert.Equal(Condition.Fair, DtoMapper.ParseCondition("fair"));
        Assert.Equal(MemberRole.Owner, DtoMapper.ParseRole("OWNER"));
        Assert.Equal(PlanId.Pro, DtoMapper.ParsePlan("pro"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParseCondition("Sealed"));
        Assert.Throws<DomainRuleException>(() => DtoMapper.ParsePlan("enterprise"));
    }

    [Fact]
    public void ToProfileDto_LowercasesThePlan()
    {
        var user = new User { Name = "Marcus", Email = "m@x.com", Initials = "MK", Plan = PlanId.Pro };
        Assert.Equal("pro", user.ToProfileDto().Plan);
    }
}
