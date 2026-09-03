using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;
using Vault.Infrastructure.Persistence.Interceptors;

namespace Vault.Infrastructure.Persistence.Repositories;

public sealed class CollectionRepository(VaultDbContext db) : ICollectionRepository
{
    public Task<List<Collection>> ListAsync(CancellationToken ct) =>
        // Creation order — matches the design's sidebar/dashboard ordering.
        WithGraph().OrderBy(c => c.CreatedAtUtc).ThenBy(c => c.Id).ToListAsync(ct);

    public Task<List<CollectionIdentity>> ListIdentitiesAsync(CancellationToken ct) =>
        db.Collections
            .OrderBy(c => c.CreatedAtUtc).ThenBy(c => c.Id)
            .Select(c => new CollectionIdentity(c.Id, c.Name, c.Version))
            .ToListAsync(ct);

    public Task<Collection?> GetAsync(string id, CancellationToken ct) =>
        WithGraph().FirstOrDefaultAsync(c => c.Id == id, ct);

    public Task<bool> ExistsAsync(string id, CancellationToken ct) =>
        db.Collections.AnyAsync(c => c.Id == id, ct);

    public void Add(Collection collection) => db.Collections.Add(collection);

    public void Remove(Collection collection) => db.Collections.Remove(collection);

    public void Touch(Collection collection) =>
        CollectionVersionInterceptor.Bump(db.Entry(collection));

    public void ReplaceGraph(Collection tracked, Collection replacement)
    {
        // Before the merge, not after: the bump has to happen whatever the merge
        // turns out to change, including nothing at all.
        Touch(tracked);

        tracked.Name = replacement.Name;
        tracked.Description = replacement.Description;
        tracked.LinkShare = replacement.LinkShare;
        tracked.BannerImageId = replacement.BannerImageId;
        tracked.IconImageId = replacement.IconImageId;
        // Plain assignment, never a coalesce: clearing the override back to null
        // is how a collection goes back to following the account currency, and
        // a coalesce would pin it to the first code ever chosen.
        tracked.Currency = replacement.Currency;
        // Plain assignment for the same reason: a collection-wide field that was
        // removed has to disappear, and a coalesce would make the first set of
        // declarations permanent.
        tracked.Fields = replacement.Fields;

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
            tracked.Sections,
            replacement.Sections,
            s => s.Id,
            (current, incoming) =>
            {
                current.Name = incoming.Name;
                current.GroupId = incoming.GroupId;
                // Plain assignment for the same reason as a group's target:
                // clearing one back to null is a legitimate edit.
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
                current.SectionId = incoming.SectionId;
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

    /// <inheritdoc />
    /// <remarks>
    /// Three reads, one per place an image id is stored, mirroring
    /// <see cref="Vault.Application.Archives.CollectionImages.ReferencedBy"/>.
    /// <para>
    /// <c>IgnoreQueryFilters</c> on every one of them is load-bearing and is the
    /// single most dangerous line in the garbage collector. Without it the
    /// filter resolves <c>CurrentTenantId</c> against whatever tenant happens to
    /// be in scope — outside a request, none — and the sweep would compute an
    /// empty reference set while reading every image row in the installation.
    /// That is total data loss, not a bug with a small blast radius.
    /// </para>
    /// <para>
    /// <c>PhotoIds</c> is decoded by EF from its JSON column rather than by hand
    /// or by a translated <c>Contains</c>: a translation that changed how a
    /// <c>Guid</c> element compares would not throw, it would answer "not
    /// referenced", and the answer to that question is a delete.
    /// </para>
    /// <para>
    /// <c>Item.Img</c> is deliberately <em>not</em> read. It is a legacy slug of
    /// the item's own name ("saga_1.jpg"), rendered as literal text by the
    /// client and remapped by neither the export nor the import — so if it ever
    /// did hold a real image id, exporting that collection would already drop
    /// the photo and importing it would already break, long before a sweep
    /// noticed. Widening the definition here alone would put a third, different
    /// answer to "what does a collection reference" beside the two that already
    /// have to agree.
    /// </para>
    /// </remarks>
    public async Task<HashSet<Guid>> ListReferencedImageIdsAcrossAllTenantsAsync(CancellationToken ct)
    {
        var referenced = new HashSet<Guid>();

        var banners = await db.Collections
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(c => c.BannerImageId != null || c.IconImageId != null)
            .Select(c => new { c.BannerImageId, c.IconImageId })
            .ToListAsync(ct);

        foreach (var collection in banners)
        {
            if (collection.BannerImageId is { } banner)
            {
                referenced.Add(banner);
            }

            if (collection.IconImageId is { } icon)
            {
                referenced.Add(icon);
            }
        }

        var items = await db.Items
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Select(i => i.PhotoIds)
            .ToListAsync(ct);

        foreach (var photoIds in items)
        {
            // photoIds[0] is the cover — there is no separate cover column, so
            // the cover needs no special case and must not get one.
            foreach (var photoId in photoIds)
            {
                referenced.Add(photoId);
            }
        }

        return referenced;
    }

    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);

    private IQueryable<Collection> WithGraph() =>
        db.Collections
            .Include(c => c.Groups)
            .Include(c => c.Sections)
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
