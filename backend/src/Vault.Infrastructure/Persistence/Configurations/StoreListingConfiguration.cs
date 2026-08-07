using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class StoreListingConfiguration : IEntityTypeConfiguration<StoreListing>
{
    public void Configure(EntityTypeBuilder<StoreListing> builder)
    {
        builder.ToTable("store_listings");
        builder.HasKey(l => l.Id);
        builder.Property(l => l.Id).HasMaxLength(64);
        builder.Property(l => l.Name).HasMaxLength(200);
        builder.Property(l => l.Publisher).HasMaxLength(200);
        builder.Property(l => l.Description).HasMaxLength(2000);
        // Read-only catalog: checklist items live as one JSON document.
        builder.OwnsMany(l => l.Items, items => items.ToJson("items"));
    }
}
