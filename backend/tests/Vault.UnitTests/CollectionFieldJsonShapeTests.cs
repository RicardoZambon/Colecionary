using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Vault.Domain.Entities;
using Vault.Domain.ValueObjects;
using Vault.Infrastructure.Persistence;

namespace Vault.UnitTests;

/// <summary>
/// Pins the persisted shape of a collection's own <c>Fields</c> column, beside
/// the two documents <see cref="GroupFieldJsonShapeTests"/> and
/// <see cref="ItemCopyJsonShapeTests"/> already pin.
/// </summary>
/// <remarks>
/// A collection's declarations and a group's are deliberately the same CLR type
/// written the same way, and that sameness is what lets one merge rule resolve
/// both. If the two documents ever drifted apart — a renamed property here, a
/// dropped enum conversion there — nothing would throw: the mismatched keys
/// would deserialize to CLR defaults, and a collection-wide field would quietly
/// come back as an unnamed text field scoped to the item.
/// </remarks>
public class CollectionFieldJsonShapeTests
{
    private static IReadOnlyEntityType FieldType() =>
        new VaultDbContextFactory().CreateDbContext([]).Model
            .FindEntityType(typeof(Collection))!
            .FindNavigation(nameof(Collection.Fields))!
            .TargetEntityType;

    [Fact]
    public void Fields_LiveInTheirOwnJsonColumn()
    {
        Assert.Equal("Fields", FieldType().GetContainerColumnName());
    }

    [Fact]
    public void FieldJsonPropertyNames_MatchAGroupsOwn()
    {
        Assert.Equal(
            ["Name", "Scope", "Type"],
            FieldType().GetProperties()
                .Where(p => !p.IsShadowProperty())
                .Select(p => p.GetJsonPropertyName())
                .OrderBy(n => n, StringComparer.Ordinal));
    }

    [Theory]
    [InlineData(nameof(GroupField.Type))]
    [InlineData(nameof(GroupField.Scope))]
    public void FieldEnums_ArePersistedAsStrings(string propertyName)
    {
        Assert.Equal(typeof(string), FieldType().FindProperty(propertyName)!.GetProviderClrType());
    }
}
