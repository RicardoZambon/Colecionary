using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Vault.Application.Abstractions;

namespace Vault.Infrastructure.Persistence.Seeding;

/// <summary>
/// Applies migrations and populates the demo dataset. Idempotent: the tenant
/// graph is seeded once (keyed on the tenant slug); store listings are
/// upserted by id since they are global catalog data.
/// </summary>
public sealed class DbSeeder(
    VaultDbContext db,
    IPasswordService passwords,
    IOptions<SeedOptions> options,
    TimeProvider timeProvider,
    ILogger<DbSeeder> logger)
{
    /// <summary>
    /// (collectionId, itemId) → age. Reproduces the design's "Recent
    /// additions" feed with real, queryable timestamps.
    /// </summary>
    private static readonly Dictionary<(string CollectionId, string ItemId), TimeSpan> RecentItems = new()
    {
        [("retro", "n64")] = TimeSpan.FromHours(2),
        [("comics", "saga")] = TimeSpan.FromDays(1),
        [("vinyl", "doomost")] = TimeSpan.FromDays(2),
        [("cards", "charizard")] = TimeSpan.FromDays(4),
    };
    public async Task SeedAsync(CancellationToken ct = default)
    {
        await db.Database.MigrateAsync(ct);

        var existingListings = await db.StoreListings.Select(l => l.Id).ToListAsync(ct);
        foreach (var listing in SeedData.StoreListings().Where(l => !existingListings.Contains(l.Id)))
        {
            db.StoreListings.Add(listing);
        }

        if (!await db.Tenants.AnyAsync(t => t.Slug == SeedData.TenantSlug, ct))
        {
            var tenantId = Guid.NewGuid();
            db.Tenants.Add(SeedData.Tenant(tenantId));

            foreach (var user in SeedData.Users(tenantId))
            {
                user.PasswordHash = passwords.Hash(user, options.Value.DemoPassword);
                db.Users.Add(user);
            }

            var now = timeProvider.GetUtcNow();
            var collections = SeedData.Collections(tenantId);
            for (var c = 0; c < collections.Count; c++)
            {
                // Staggered creation dates keep the seed order (retro first)
                // and give every item a real timestamp.
                var collection = collections[c];
                collection.CreatedAtUtc = now.AddDays(-30 + c);
                for (var i = 0; i < collection.Items.Count; i++)
                {
                    var item = collection.Items[i];
                    item.CreatedAtUtc = RecentItems.TryGetValue((collection.Id, item.Id), out var age)
                        ? now - age
                        : collection.CreatedAtUtc.AddMinutes(i);
                }
            }

            db.Collections.AddRange(collections);
            logger.LogInformation("Seeding demo tenant '{Slug}' ({TenantId})", SeedData.TenantSlug, tenantId);
        }

        var changes = await db.SaveChangesAsync(ct);
        logger.LogInformation("Database ready — {Changes} seed rows written", changes);
    }
}
