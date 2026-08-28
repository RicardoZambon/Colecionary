using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Vault.Application.Abstractions;
using Vault.Application.Setup;
using Vault.Domain.Entities;
using Vault.Domain.Enums;
using Vault.Infrastructure.Persistence;

namespace Vault.Infrastructure.Setup;

/// <summary>
/// First-run production bootstrap: migrate, then create the first tenant + owner
/// from the wizard input. Idempotent — if a tenant already exists it only migrates.
/// Writes run unauthenticated with an explicit TenantId, which the tenant
/// interceptor permits (same path the demo seeder uses at startup).
/// </summary>
public sealed class SetupBootstrapper(
    VaultDbContext db,
    IPasswordService passwords,
    ILogger<SetupBootstrapper> logger) : ISetupBootstrapper
{
    public async Task BootstrapAsync(SetupBootstrapOptions options, CancellationToken ct = default)
    {
        await db.Database.MigrateAsync(ct);

        if (await db.Tenants.AnyAsync(ct))
        {
            logger.LogInformation("Setup bootstrap skipped — a tenant already exists.");
            return;
        }

        var tenantId = Guid.NewGuid();
        db.Tenants.Add(new Tenant
        {
            Id = tenantId,
            Name = options.OrganizationName,
            Slug = Slugify(options.OrganizationName),
            DefaultTheme = options.DefaultTheme,
            DefaultCurrency = options.DefaultCurrency,
        });

        var owner = new User
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Email = options.OwnerEmail.Trim(),
            Name = options.OwnerName,
            Initials = Initials(options.OwnerName),
            Role = MemberRole.Owner,
            Plan = PlanId.Free,
        };
        owner.PasswordHash = passwords.Hash(owner, options.OwnerPassword);
        db.Users.Add(owner);

        await db.SaveChangesAsync(ct);
        logger.LogInformation(
            "Setup complete — tenant '{Slug}' ({TenantId}) with owner {Email}",
            Slugify(options.OrganizationName),
            tenantId,
            owner.Email);
    }

    private static string Slugify(string value)
    {
        var slug = new StringBuilder();
        var lastDash = false;
        foreach (var ch in value.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch))
            {
                slug.Append(ch);
                lastDash = false;
            }
            else if (!lastDash && slug.Length > 0)
            {
                slug.Append('-');
                lastDash = true;
            }
        }

        var result = slug.ToString().Trim('-');
        return result.Length > 0 ? result : "org";
    }

    private static string Initials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var initials = parts.Length switch
        {
            0 => "?",
            1 => parts[0][..Math.Min(2, parts[0].Length)],
            _ => $"{parts[0][0]}{parts[^1][0]}",
        };
        return initials.ToUpperInvariant();
    }
}
