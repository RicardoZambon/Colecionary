using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Vault.Domain.Entities;
using Vault.Domain.ValueObjects;
using Vault.Infrastructure.Persistence;

namespace Vault.UnitTests;

/// <summary>
/// Pins the persisted shape of the `Copies` JSON column. The AddItemCopies
/// migration writes that document once, from raw T-SQL, and never regenerates
/// it — so a drifted property name or a dropped enum conversion would be
/// completely silent: missing keys deserialize to CLR defaults with no error.
/// The column itself was named `copies` until UseSchemaQualifiedPascalCaseNames
/// renamed it; that rename is an explicit migration operation, unlike the
/// property names inside the document, which stay pinned.
/// These assertions need no database, so CI (which runs only the unit tests)
/// still catches the drift.
/// </summary>
public class ItemCopyJsonShapeTests
{
    // Design-time factory: builds the model without ever opening a connection.
    private static IReadOnlyEntityType CopyType() =>
        new VaultDbContextFactory().CreateDbContext([]).Model
            .FindEntityType(typeof(Item))!
            .FindNavigation(nameof(Item.Copies))!
            .TargetEntityType;

    [Fact]
    public void Copies_LiveInTheirOwnJsonColumn()
    {
        Assert.Equal("Copies", CopyType().GetContainerColumnName());
    }

    [Fact]
    public void CopyJsonPropertyNames_MatchTheMigrationBackfill()
    {
        var names = CopyType().GetProperties()
            .Where(p => !p.IsShadowProperty())
            .Select(p => p.GetJsonPropertyName())
            .OrderBy(n => n, StringComparer.Ordinal);

        Assert.Equal(
            ["AcquiredOn", "Condition", "Id", "Notes", "Price", "Status", "Value"],
            names);
    }

    [Theory]
    [InlineData(nameof(ItemCopy.Condition))]
    [InlineData(nameof(ItemCopy.Status))]
    public void CopyEnums_ArePersistedAsStrings(string propertyName)
    {
        // Without an explicit conversion EF writes enums into JSON as integers,
        // which neither the backfill nor the string-enum API contract expects.
        Assert.Equal(typeof(string), CopyType().FindProperty(propertyName)!.GetProviderClrType());
    }
}
