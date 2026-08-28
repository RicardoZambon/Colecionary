using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Configurations;

public sealed class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.ToTable("Tenants", VaultSchemas.Identity);
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Slug).HasMaxLength(64);
        builder.Property(t => t.Name).HasMaxLength(200);
        builder.Property(t => t.DefaultTheme).HasMaxLength(32);
        // Required: every amount in the vault is read through this, so there is
        // no row for which "no currency" is a coherent answer.
        builder.Property(t => t.DefaultCurrency).HasMaxLength(3).IsRequired();
        builder.HasIndex(t => t.Slug).IsUnique();
    }
}
