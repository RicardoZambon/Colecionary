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
        builder.Property(i => i.Condition).HasConversion<string>().HasMaxLength(8);
        builder.Property(i => i.Value).HasPrecision(12, 2);
        builder.Property(i => i.Price).HasPrecision(12, 2);
        // GroupId is intentionally NOT a foreign key: groups are replaced
        // wholesale by collection updates and item group references may dangle.
        builder.Property(i => i.GroupId).HasMaxLength(64);
        builder.Property(i => i.Img).HasMaxLength(260);
        // List<string> Tags maps to an nvarchar(max) JSON column; Custom is a JSON document.
        builder.OwnsMany(i => i.Custom, custom => custom.ToJson("custom"));
    }
}
