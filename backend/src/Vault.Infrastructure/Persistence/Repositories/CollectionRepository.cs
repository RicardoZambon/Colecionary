using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Repositories;

public sealed class CollectionRepository(VaultDbContext db) : ICollectionRepository
{
    public Task<List<Collection>> ListAsync(CancellationToken ct) =>
        // Creation order — matches the design's sidebar/dashboard ordering.
        WithGraph().OrderBy(c => c.CreatedAtUtc).ThenBy(c => c.Id).ToListAsync(ct);

    public Task<Collection?> GetAsync(string id, CancellationToken ct) =>
        WithGraph().FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<bool> ExistsAsync(string id, CancellationToken ct) =>
        db.Collections.AnyAsync(c => c.Id == id, ct);

    public void Add(Collection collection) => db.Collections.Add(collection);

    public void Remove(Collection collection) => db.Collections.Remove(collection);

    public void ReplaceGraph(Collection tracked, Collection replacement)
    {
        tracked.Name = replacement.Name;
        tracked.Description = replacement.Description;
        tracked.LinkShare = replacement.LinkShare;
        tracked.BannerImageId = replacement.BannerImageId;
        tracked.IconImageId = replacement.IconImageId;
        // Plain assignment, never a coalesce: clearing the override back to null
        // is how a collection goes back to following the account currency, and
        // a coalesce would pin it to the first code ever chosen.
        tracked.Currency = replacement.Currency;

        MergeByKey(
            tracked.Groups,
            replacement.Groups,
            g => g.Id,
            (current, incoming) =>
            {
                current.Name = incoming.Name;
                current.ParentId = incoming.ParentId;
                current.Fields = incoming.Fields;
                current.SortBy = incoming.SortBy;
                current.SortDirection = incoming.SortDirection;
                // Plain assignment, never a coalesce: clearing a target back to
                // null is a legitimate edit, and omitting the line entirely
                // would let a target save on create and then never change.
                current.Target = incoming.Target;
                current.SortOrder = incoming.SortOrder;
            });

        MergeByKey(
            tracked.Items,
            replacement.Items,
            i => i.Id,
            (current, incoming) =>
            {
                current.Name = incoming.Name;
                current.Description = incoming.Description;
                current.Year = incoming.Year;
                current.Value = incoming.Value;
                current.GroupId = incoming.GroupId;
                current.Tags = incoming.Tags;
                current.Img = incoming.Img;
                current.Custom = incoming.Custom;
                current.Copies = incoming.Copies;
                current.SortOrder = incoming.SortOrder;
                current.PhotoIds = incoming.PhotoIds;
                // CreatedAtUtc deliberately kept — server-controlled.
            });

        MergeByKey(
            tracked.Members,
            replacement.Members,
            m => m.Email,
            (current, incoming) =>
            {
                current.Name = incoming.Name;
                current.Initials = incoming.Initials;
                current.Role = incoming.Role;
            });
    }

    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);

    private IQueryable<Collection> WithGraph() =>
        db.Collections
            .Include(c => c.Groups)
            .Include(c => c.Items)
            .Include(c => c.Members)
            .AsSplitQuery();

    /// <summary>
    /// Syncs a tracked child collection from an untracked replacement:
    /// updates matches, removes absentees, adds newcomers. Keeps EF change
    /// tracking coherent for composite-keyed children.
    /// </summary>
    private static void MergeByKey<T>(
        List<T> tracked,
        List<T> replacement,
        Func<T, string> key,
        Action<T, T> update)
        where T : class
    {
        var incomingByKey = replacement.ToDictionary(key, StringComparer.Ordinal);

        foreach (var current in tracked.Where(t => !incomingByKey.ContainsKey(key(t))).ToList())
        {
            tracked.Remove(current);
        }

        var existingKeys = tracked.Select(key).ToHashSet(StringComparer.Ordinal);
        foreach (var current in tracked)
        {
            update(current, incomingByKey[key(current)]);
        }

        foreach (var incoming in replacement.Where(r => !existingKeys.Contains(key(r))))
        {
            tracked.Add(incoming);
        }
    }
}
