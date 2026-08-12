using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("Users", VaultSchemas.Identity);
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Email).HasMaxLength(320);
        builder.Property(u => u.Name).HasMaxLength(200);
        builder.Property(u => u.Initials).HasMaxLength(4);
        builder.Property(u => u.Role).HasConversion<string>().HasMaxLength(16);
        builder.Property(u => u.Plan).HasConversion<string>().HasMaxLength(16);
        builder.HasIndex(u => new { u.TenantId, u.Email }).IsUnique();
        builder.HasOne<Tenant>().WithMany().HasForeignKey(u => u.TenantId).OnDelete(DeleteBehavior.Cascade);
    }
}
