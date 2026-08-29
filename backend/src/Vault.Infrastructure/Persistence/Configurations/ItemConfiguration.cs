using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class ItemConfiguration : IEntityTypeConfiguration<Item>
{
    public void Configure(EntityTypeBuilder<Item> builder)
    {
        builder.ToTable("Items", VaultSchemas.Catalog);
        builder.HasKey(i => new { i.TenantId, i.CollectionId, i.Id });
        builder.Property(i => i.CollectionId).HasMaxLength(64);
        builder.Property(i => i.Id).HasMaxLength(64);
        builder.Property(i => i.Name).HasMaxLength(200);
        builder.Property(i => i.Description).HasMaxLength(4000);
        builder.Property(i => i.Value).HasPrecision(12, 2);
        // GroupId is intentionally NOT a foreign key: groups are replaced
        // wholesale by collection updates and item group references may dangle.
        builder.Property(i => i.GroupId).HasMaxLength(64);
        // Neither is SectionId, and for the same reason.
        builder.Property(i => i.SectionId).HasMaxLength(64);
        builder.Property(i => i.Img).HasMaxLength(260);
        // List<string> Tags maps to an nvarchar(max) JSON column; Custom is a JSON document.
        builder.OwnsMany(i => i.Custom, custom => custom.ToJson("Custom"));

        // Physical copies live as one JSON document, same pattern as `Custom`.
        // Unlike `Custom`, the JSON property names *inside* the document are
        // PINNED: the AddItemCopies migration writes this document from raw T-SQL
        // and never regenerates it, so a CLR rename would silently orphan every
        // existing copy's data with no compiler error, no migration and no
        // exception. The containing column is a different matter — it was named
        // `copies` up to AddItemCopies and renamed by UseSchemaQualifiedPascalCaseNames;
        // that rename is a real migration operation, so it is safe.
        builder.OwnsMany(i => i.Copies, copies =>
        {
            copies.ToJson("Copies");
            copies.Property(c => c.Id).HasJsonPropertyName("Id");
            // The string conversions are load-bearing: an unconverted enum is
            // written to JSON as an integer, which neither the backfill nor the
            // camelCase-with-string-enums contract expects.
            copies.Property(c => c.Condition).HasConversion<string>().HasJsonPropertyName("Condition");
            copies.Property(c => c.Status).HasConversion<string>().HasJsonPropertyName("Status");
            copies.Property(c => c.Price).HasPrecision(12, 2).HasJsonPropertyName("Price");
            copies.Property(c => c.Value).HasPrecision(12, 2).HasJsonPropertyName("Value");
            copies.Property(c => c.AcquiredOn).HasJsonPropertyName("AcquiredOn");
            copies.Property(c => c.Notes).HasJsonPropertyName("Notes");
        });
    }
}
