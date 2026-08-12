using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class GroupConfiguration : IEntityTypeConfiguration<Group>
{
    public void Configure(EntityTypeBuilder<Group> builder)
    {
        builder.ToTable("groups");
        builder.HasKey(g => new { g.TenantId, g.CollectionId, g.Id });
        builder.Property(g => g.CollectionId).HasMaxLength(64);
        builder.Property(g => g.Id).HasMaxLength(64);
        builder.Property(g => g.Name).HasMaxLength(200);
        builder.Property(g => g.ParentId).HasMaxLength(64);
        // "field:<name>" has to fit a 100-char field name plus the prefix.
        builder.Property(g => g.SortBy).HasMaxLength(120);
        builder.Property(g => g.SortDirection).HasMaxLength(4);

        // Fields used to be a primitive collection of strings in this same
        // column. The JSON property names are PINNED for the reason spelled out
        // in ItemConfiguration: AddGroupFieldTypesAndSort rewrites this document
        // from raw T-SQL and never regenerates it, so a CLR rename would orphan
        // every existing group's fields silently.
        builder.OwnsMany(g => g.Fields, fields =>
        {
            fields.ToJson("Fields");
            fields.Property(f => f.Name).HasJsonPropertyName("Name");
            // Without the string conversion the type is written as an integer,
            // which neither the backfill nor the string-enum contract expects.
            fields.Property(f => f.Type).HasConversion<string>().HasJsonPropertyName("Type");
        });
    }
}
