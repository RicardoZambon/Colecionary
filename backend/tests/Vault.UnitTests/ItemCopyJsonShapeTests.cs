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

    /// <summary>
    /// A copy's own field values are a second level of ownership inside the
    /// same document, not a column of their own.
    /// </summary>
    /// <remarks>
    /// Worth pinning because nothing else would notice it moving: EF is happy
    /// to give a nested owned collection its own table, and if it ever did, a
    /// copy's values would silently stop travelling with the copy — no error,
    /// no migration, just an empty list on every read. It also has to stay
    /// inside `Copies` for `CollectionVersionInterceptor.OwnerOf` to walk two
    /// hops up to the item and bump the collection's version.
    /// </remarks>
    [Fact]
    public void CopyCustomValues_LiveInsideTheCopiesDocument()
    {
        var custom = CopyType().FindNavigation(nameof(ItemCopy.Custom))!.TargetEntityType;

        Assert.Equal("Copies", custom.GetContainerColumnName());
        Assert.Equal(
            ["Key", "Value"],
            custom.GetProperties()
                .Where(p => !p.IsShadowProperty())
                .Select(p => p.GetJsonPropertyName())
                .OrderBy(n => n, StringComparer.Ordinal));
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
