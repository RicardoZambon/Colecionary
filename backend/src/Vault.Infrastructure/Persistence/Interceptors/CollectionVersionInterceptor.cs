using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Vault.Domain.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Interceptors;

/// <summary>
/// Advances <see cref="Collection.Version"/> whenever anything under the
/// collection is written — the root row, a group, an item or a member.
/// </summary>
/// <remarks>
/// <para>
/// The version is a token for the <b>whole aggregate</b>, and that is the only
/// reading that is safe. A client holding version <i>n</i> is entitled to PUT
/// the whole document, and that PUT deletes every child its payload does not
/// carry — so if an item edit did not move the version, the client would still
/// pass its precondition and would erase an edit it never saw. Every write to
/// the aggregate therefore has to move the number, including the ones that
/// touch no column on the <c>Collections</c> row at all. That is also why this
/// is a counter and not a SQL <c>rowversion</c>: a rowversion moves when its own
/// row is updated, which is exactly the case an item edit is not.
/// </para>
/// <para>
/// It lives in an interceptor rather than in the services for the same reason
/// tenant stamping does (see <see cref="TenantStampingInterceptor"/>): a rule
/// that every future write path has to remember is not a rule, it is a comment.
/// A write that reaches SQL without a bump is a silently lost update, which is
/// the one failure this whole feature exists to prevent — so a child written
/// without its collection in scope <b>throws</b> rather than saving unguarded.
/// </para>
/// <para>
/// Three states are deliberately skipped. A collection being <c>Added</c> starts
/// at 1 and has no reader to disappoint; one being <c>Deleted</c> is about to
/// stop existing; and one whose <c>Version</c> is already marked modified has
/// been bumped by <see cref="Repositories.CollectionRepository.Touch"/> on the
/// request path, which does the same thing one step earlier so that a PUT
/// changing nothing still advances and still runs the guarded UPDATE.
/// </para>
/// </remarks>
public sealed class CollectionVersionInterceptor : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        BumpTouchedCollections(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        BumpTouchedCollections(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    /// <summary>
    /// Advances one tracked collection's version, once. Idempotent within a
    /// single <c>SaveChanges</c>: the second caller sees the property already
    /// modified and leaves it alone, so a bump can never be applied twice and
    /// the original value EF puts in the <c>WHERE</c> clause stays the one that
    /// was read from the database.
    /// </summary>
    public static void Bump(EntityEntry<Collection> entry)
    {
        if (entry.State is EntityState.Added or EntityState.Deleted or EntityState.Detached)
        {
            return;
        }

        var version = entry.Property(c => c.Version);
        if (version.IsModified)
        {
            return;
        }

        // From the original value, not the current one: `IsModified = true` is
        // what forces the UPDATE even when nothing else on the row changed, and
        // EF keeps using OriginalValue for the concurrency check.
        //
        // Checked on purpose. Two billion writes to one collection is not a
        // realistic number, but wrapping to int.MinValue would eventually hand
        // out a version some very old client is still holding, and a token that
        // matches by coincidence is worse than no token at all. Failing loudly
        // is the only outcome here that is not silently wrong.
        version.CurrentValue = checked(version.OriginalValue + 1);
        version.IsModified = true;
    }

    /// <summary>
    /// Which collection an entry belongs to, or null if it belongs to none.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Walks owned types up to their principal first, which is not a nicety: a
    /// collection's JSON columns — an item's <c>Copies</c> and <c>Custom</c>, a
    /// group's <c>Fields</c> — are EF-owned entities, and rewriting one leaves
    /// the row that carries it <c>Unchanged</c>. A sweep that matched on the
    /// entity type alone would see nothing at all for such a write: no bump,
    /// and, worse, no <c>UPDATE</c> of the root either, so the concurrency token
    /// would never be consulted and the write would go through unguarded. The
    /// request paths all call <c>Touch</c> and so are covered twice over; this is
    /// what makes the guarantee hold for a path that does not.
    /// </para>
    /// <para>
    /// An owned entity carries its principal's key, but under names EF composes
    /// (<c>Item.TenantId</c> becomes <c>ItemTenantId</c> on <c>ItemCopy</c>), and
    /// a JSON collection exposes no navigation back to the owner. So the names
    /// are resolved through the ownership foreign keys themselves rather than
    /// guessed — which also means a second level of ownership, or a rename,
    /// keeps working.
    /// </para>
    /// </remarks>
    private static (Guid TenantId, string CollectionId)? OwnerOf(EntityEntry entry)
    {
        var root = entry.Metadata;
        var hops = new List<IReadOnlyDictionary<string, string>>();
        while (root.IsOwned() && root.FindOwnership() is { } ownership)
        {
            var principal = ownership.PrincipalKey.Properties;
            var dependent = ownership.Properties;
            hops.Add(principal
                .Select((property, i) => (Principal: property.Name, Dependent: dependent[i].Name))
                .ToDictionary(pair => pair.Principal, pair => pair.Dependent, StringComparer.Ordinal));
            root = ownership.PrincipalEntityType;
        }

        if (root.ClrType != typeof(Collection)
            && root.ClrType != typeof(Group)
            && root.ClrType != typeof(Section)
            && root.ClrType != typeof(Item)
            && root.ClrType != typeof(CollectionMember))
        {
            return null;
        }

        var collectionIdOnRoot =
            root.ClrType == typeof(Collection) ? nameof(Collection.Id) : nameof(Item.CollectionId);

        // Null here would mean "not part of a collection", which for one of the
        // five aggregate types is not true — it would mean the ids could not be
        // read, and the entry would then be skipped in silence. Everything this
        // class exists to prevent happens in silence, so it refuses instead.
        return Read(entry, NameOnEntry(nameof(ITenantOwned.TenantId), hops)) is Guid tenantId
            && Read(entry, NameOnEntry(collectionIdOnRoot, hops)) is string collectionId
                ? (tenantId, collectionId)
                : throw new InvalidOperationException(
                    $"Cannot tell which collection a changed {entry.Metadata.DisplayName()} belongs to: "
                    + "its owning keys could not be read, so the collection's version cannot be advanced.");
    }

    /// <summary>
    /// Translates a property name on the aggregate's own type into the name it
    /// carries on a (possibly nested) owned entry.
    /// </summary>
    /// <remarks>
    /// The hops were collected walking up, so they are applied walking down —
    /// the outermost rename first, the innermost last.
    /// </remarks>
    private static string NameOnEntry(
        string rootPropertyName,
        List<IReadOnlyDictionary<string, string>> hops)
    {
        var name = rootPropertyName;
        for (var i = hops.Count - 1; i >= 0; i--)
        {
            if (hops[i].TryGetValue(name, out var renamed))
            {
                name = renamed;
            }
        }

        return name;
    }

    /// <summary>
    /// A property's value: current where there is one, original otherwise — a
    /// deleted entry's current values are the ones on their way out.
    /// </summary>
    private static object? Read(EntityEntry entry, string propertyName)
    {
        if (entry.Metadata.FindProperty(propertyName) is null)
        {
            return null;
        }

        var property = entry.Property(propertyName);
        return property.CurrentValue ?? property.OriginalValue;
    }

    private static void BumpTouchedCollections(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var owners = context.ChangeTracker.Entries<Collection>()
            .ToDictionary(e => (e.Entity.TenantId, e.Entity.Id));

        // Snapshot first: bumping mutates entries, and a dictionary keyed on the
        // owner is cheaper than re-scanning for each child.
        var touched = new HashSet<(Guid TenantId, string CollectionId)>();

        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted))
            {
                continue;
            }

            if (OwnerOf(entry) is { } key)
            {
                touched.Add(key);
            }
        }

        foreach (var key in touched)
        {
            if (owners.TryGetValue(key, out var entry))
            {
                Bump(entry);
                continue;
            }

            // Refusing is the point. Writing a child whose collection is not in
            // scope would advance no version, which means every open client
            // keeps a token that still passes its precondition — a lost update
            // with no error anywhere. Every path in the app loads the aggregate
            // root before writing under it; one that stops doing so is a defect,
            // and this is where it surfaces.
            throw new InvalidOperationException(
                $"Cannot version collection '{key.CollectionId}': a child of it is being written "
                + "without the collection itself being tracked. Load the collection through "
                + "ICollectionRepository before writing anything under it.");
        }
    }
}
