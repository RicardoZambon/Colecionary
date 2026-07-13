using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class CollectionConfiguration : IEntityTypeConfiguration<Collection>
{
    public void Configure(EntityTypeBuilder<Collection> builder)
    {
        builder.ToTable("collections");

        // Composite key: the public string id is unique per tenant only —
        // two tenants can both import the same store listing id.
        builder.HasKey(c => new { c.TenantId, c.Id });
        builder.Property(c => c.Id).HasMaxLength(64);
        builder.Property(c => c.Name).HasMaxLength(200);
        builder.Property(c => c.Description).HasMaxLength(2000);

        builder.HasOne<Tenant>().WithMany().HasForeignKey(c => c.TenantId).OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(c => c.Groups)
            .WithOne()
            .HasForeignKey(g => new { g.TenantId, g.CollectionId })
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
