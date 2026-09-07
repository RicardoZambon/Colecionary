using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class CollectionConfiguration : IEntityTypeConfiguration<Collection>
{
    public void Configure(EntityTypeBuilder<Collection> builder)
    {
        builder.ToTable("Collections", VaultSchemas.Catalog);

        // Composite key: the public string id is unique per tenant only —
        // two tenants can both import the same store listing id.
        builder.HasKey(c => new { c.TenantId, c.Id });
        builder.Property(c => c.Id).HasMaxLength(64);
        builder.Property(c => c.Name).HasMaxLength(200);
        builder.Property(c => c.Description).HasMaxLength(2000);
        // Nullable on purpose — null is "follow the account", not a missing value.
        builder.Property(c => c.Currency).HasMaxLength(3);

        // The aggregate's optimistic-concurrency token. As a concurrency token
        // EF appends `AND Version = @original` to every UPDATE of this row, so a
        // second writer working from a version somebody else has already moved
        // on updates zero rows and SaveChanges throws instead of overwriting.
        // The value is advanced by CollectionVersionInterceptor, not by SQL: a
        // `rowversion` would only move when this row itself is updated, and an
        // item edit writes no column here.
        builder.Property(c => c.Version).IsConcurrencyToken();

        // Collection-wide field declarations, same JSON shape as a group's own
        // Fields so one merge rule covers both. Property names are pinned for
        // the same reason they are on Groups.Fields: the document is written
        // and read by name, and a CLR rename would orphan it in silence.
        builder.OwnsMany(c => c.Fields, fields =>
        {
            fields.ToJson("Fields");
            fields.Property(f => f.Name).HasJsonPropertyName("Name");
            fields.Property(f => f.Type).HasConversion<string>().HasJsonPropertyName("Type");
            fields.Property(f => f.Scope).HasConversion<string>().HasJsonPropertyName("Scope");
        });

        builder.HasOne<Tenant>().WithMany().HasForeignKey(c => c.TenantId).OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Groups)
            .WithOne()
            .HasForeignKey(g => new { g.TenantId, g.CollectionId })
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Sections)
            .WithOne()
            .HasForeignKey(s => new { s.TenantId, s.CollectionId })
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Items)
            .WithOne()
            .HasForeignKey(i => new { i.TenantId, i.CollectionId })
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Members)
            .WithOne()
            .HasForeignKey(m => new { m.TenantId, m.CollectionId })
            .OnDelete(DeleteBehavior.Cascade);
    }
}
