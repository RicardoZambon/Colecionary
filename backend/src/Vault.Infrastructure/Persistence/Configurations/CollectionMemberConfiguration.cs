using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class CollectionMemberConfiguration : IEntityTypeConfiguration<CollectionMember>
{
    public void Configure(EntityTypeBuilder<CollectionMember> builder)
    {
        builder.ToTable("collection_members");
        builder.HasKey(m => new { m.TenantId, m.CollectionId, m.Email });
        builder.Property(m => m.CollectionId).HasMaxLength(64);
        builder.Property(m => m.Email).HasMaxLength(320);
        builder.Property(m => m.Name).HasMaxLength(200);
        builder.Property(m => m.Initials).HasMaxLength(4);
        builder.Property(m => m.Role).HasConversion<string>().HasMaxLength(16);
    }
}
