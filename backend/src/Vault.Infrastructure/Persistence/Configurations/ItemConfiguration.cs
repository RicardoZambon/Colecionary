using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class ItemConfiguration : IEntityTypeConfiguration<Item>
{
    public void Configure(EntityTypeBuilder<Item> builder)
    {
        builder.ToTable("items");
        builder.HasKey(i => new { i.TenantId, i.CollectionId, i.Id });
        builder.Property(i => i.CollectionId).HasMaxLength(64);
        builder.Property(i => i.Id).HasMaxLength(64);
        builder.Property(i => i.Name).HasMaxLength(200);
        builder.Property(i => i.Description).HasMaxLength(4000);
        builder.Property(i => i.Value).HasPrecision(12, 2);
        // GroupId is intentionally NOT a foreign key: groups are replaced
        // wholesale by collection updates and item group references may dangle.
        builder.Property(i => i.GroupId).HasMaxLength(64);
        builder.Property(i => i.Img).HasMaxLength(260);
        // List<string> Tags maps to an nvarchar(max) JSON column; Custom is a JSON document.
        builder.OwnsMany(i => i.Custom, custom => custom.ToJson("custom"));

        // Physical copies live as one JSON document, same pattern as `custom`.
        // Unlike `custom`, the JSON property names are PINNED: the AddItemCopies
        // migration writes this document from raw T-SQL and never regenerates it,
        // so a CLR rename would silently orphan every existing copy's data with
        // no compiler error, no migration and no exception.
        builder.OwnsMany(i => i.Copies, copies =>
        {
            copies.ToJson("copies");
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
