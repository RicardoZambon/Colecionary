using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class SectionConfiguration : IEntityTypeConfiguration<Section>
{
    public void Configure(EntityTypeBuilder<Section> builder)
    {
        builder.ToTable("Sections", VaultSchemas.Catalog);
        builder.HasKey(s => new { s.TenantId, s.CollectionId, s.Id });
        builder.Property(s => s.CollectionId).HasMaxLength(64);
        builder.Property(s => s.Id).HasMaxLength(64);
        // Deliberately NOT a foreign key, for the same reason Item.GroupId is
        // not one: the whole tree is replaced wholesale by a collection PUT, so
        // a reference may dangle for the length of an edit and is resolved on
        // read instead.
        builder.Property(s => s.GroupId).HasMaxLength(64);
        builder.Property(s => s.Name).HasMaxLength(200);
    }
}
