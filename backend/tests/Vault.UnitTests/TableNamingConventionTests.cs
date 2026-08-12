using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Vault.Infrastructure.Persistence;

namespace Vault.UnitTests;

/// <summary>
/// Pins the physical naming convention: every table is PascalCase and lives in
/// an explicitly declared schema, so no object ever resolves through the
/// caller's default schema. A new entity mapped with a bare
/// <c>ToTable("thing")</c> — or with no <c>ToTable</c> at all — fails here
/// rather than shipping a stray lowercase table into <c>dbo</c>.
/// </summary>
public class TableNamingConventionTests
{
    private static readonly string[] KnownSchemas =
        [VaultSchemas.Identity, VaultSchemas.Catalog, VaultSchemas.Store, VaultSchemas.Storage];

    // Design-time factory: builds the model without ever opening a connection.
    private static IEnumerable<IEntityType> MappedEntityTypes() =>
        new VaultDbContextFactory().CreateDbContext([]).Model
            .GetEntityTypes()
            // Owned JSON types share their owner's table and declare no name of
            // their own; the owner already carries the assertion.
            .Where(t => !t.IsOwned());

    [Fact]
    public void EveryTable_DeclaresAKnownSchema()
    {
        var offenders = MappedEntityTypes()
            .Where(t => !KnownSchemas.Contains(t.GetSchema()))
            .Select(t => $"{t.ClrType.Name} -> {t.GetSchema() ?? "(default)"}.{t.GetTableName()}")
            .ToArray();

        Assert.Empty(offenders);
    }

    [Fact]
    public void EveryTable_IsPascalCase()
    {
        var offenders = MappedEntityTypes()
            .Select(t => t.GetTableName()!)
            .Where(name => !char.IsUpper(name[0]) || name.Contains('_'))
            .ToArray();

        Assert.Empty(offenders);
    }

    [Fact]
    public void EveryColumn_IsPascalCase()
    {
        // Includes the JSON container columns (Custom, Copies, Fields, Items),
        // which are named independently of any CLR property.
        var offenders = new VaultDbContextFactory().CreateDbContext([]).Model
            .GetEntityTypes()
            .SelectMany(t => t.GetProperties()
                // EF synthesizes an ordinal shadow property to order JSON-owned
                // collections; it is bookkeeping inside the document, not a column.
                .Where(p => !p.IsShadowProperty())
                .Select(p => p.GetColumnName())
                .Append(t.IsOwned() ? t.GetContainerColumnName() : null))
            .Where(name => !string.IsNullOrEmpty(name))
            .Where(name => !char.IsUpper(name![0]) || name.Contains('_'))
            .Distinct()
            .ToArray();

        Assert.Empty(offenders);
    }
}
