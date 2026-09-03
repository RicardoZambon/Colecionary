using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Vault.Domain.Entities;
using Vault.Domain.ValueObjects;
using Vault.Infrastructure.Persistence;

namespace Vault.UnitTests;

/// <summary>
/// Pins the persisted shape of the `Fields` JSON column, for the same reason
/// <see cref="ItemCopyJsonShapeTests"/> pins `copies`: the
/// AddGroupFieldTypesAndSort migration rewrites that document once, from raw
/// T-SQL, and never regenerates it. A drifted property name or a dropped enum
/// conversion would be entirely silent — missing keys deserialize to CLR
/// defaults with no error. No database needed, so CI catches the drift.
/// </summary>
public class GroupFieldJsonShapeTests
{
    private static IReadOnlyEntityType FieldType() =>
        new VaultDbContextFactory().CreateDbContext([]).Model
            .FindEntityType(typeof(Group))!
            .FindNavigation(nameof(Group.Fields))!
            .TargetEntityType;

    [Fact]
    public void Fields_KeepTheirOriginalColumn()
    {
        // The column name predates the document: it used to hold a JSON array
        // of plain strings, and the migration rewrites it in place.
        Assert.Equal("Fields", FieldType().GetContainerColumnName());
    }

    [Fact]
    public void FieldJsonPropertyNames_MatchTheMigrationBackfill()
    {
        var names = FieldType().GetProperties()
            .Where(p => !p.IsShadowProperty())
            .Select(p => p.GetJsonPropertyName())
            .OrderBy(n => n, StringComparer.Ordinal);

        // "Scope" was added after the backfill and is deliberately absent from
        // it: a document the migration wrote carries no such property, and EF
        // reads that absence as FieldScope.Item — which is what every field
        // declared before scopes existed actually is. Adding it here is
        // therefore not a claim that the backfill writes it, but the record
        // that this is the third name the document may carry.
        Assert.Equal(["Name", "Scope", "Type"], names);
    }

    [Fact]
    public void FieldScope_IsPersistedAsAString()
    {
        // Same reason as the type: an unconverted enum is written as an integer,
        // which neither the string-enum wire contract nor a human reading the
        // column expects.
        Assert.Equal(
            typeof(string),
            FieldType().FindProperty(nameof(GroupField.Scope))!.GetProviderClrType());
    }

    [Fact]
    public void FieldType_IsPersistedAsAString()
    {
        // The backfill writes N'Text', not 0.
        Assert.Equal(
            typeof(string),
            FieldType().FindProperty(nameof(GroupField.Type))!.GetProviderClrType());
    }
}
