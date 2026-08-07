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
        // List<string> Fields maps to an nvarchar(max) JSON column (EF primitive collection).
    }
}
