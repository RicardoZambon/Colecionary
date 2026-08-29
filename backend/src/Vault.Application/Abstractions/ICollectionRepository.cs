using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

/// <summary>
/// Aggregate-root repository for collections. All reads are implicitly
/// tenant-filtered by the DbContext's global query filters.
/// </summary>
/// <summary>
/// Just enough of a collection to recognise it by name — and to say which
/// version of it an import was planned against.
/// </summary>
public sealed record CollectionIdentity(string Id, string Name, int Version);

public interface ICollectionRepository
{
    Task<List<Collection>> ListAsync(CancellationToken ct);

    /// <summary>
    /// Every collection's id and name, without their graphs.
    /// </summary>
    /// <remarks>
    /// The import asks "is one of these already here?" and needs nothing but
    /// the names to answer. Going through <see cref="ListAsync"/> would drag
    /// every item, group, copy and member of the whole vault into memory to
    /// compare a handful of strings.
    /// </remarks>
    Task<List<CollectionIdentity>> ListIdentitiesAsync(CancellationToken ct);

    Task<Collection?> GetAsync(string id, CancellationToken ct);

    Task<bool> ExistsAsync(string id, CancellationToken ct);

    void Add(Collection collection);

    void Remove(Collection collection);

    /// <summary>
    /// Syncs a tracked collection's graph (groups/members wholesale, items
    /// merged by id) from an untracked replacement. EF change-tracking
    /// mechanics — lives in the repository, not the service.
    /// </summary>
    /// <remarks>
    /// Advances <see cref="Collection.Version"/> as part of the replacement, so
    /// the two callers that replace a whole document — the collection PUT and an
    /// import that overwrites — cannot do it and forget.
    /// </remarks>
    void ReplaceGraph(Collection tracked, Collection replacement);

    /// <summary>
    /// Advances a tracked collection's version so the next save carries the
    /// guarded UPDATE, whether or not anything else about the row changed.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Idempotent within one save. It exists because "did anything change?" is
    /// not the same question as "should this write be checked?": a PUT whose
    /// payload happens to match what is stored still has to fail if the client
    /// built it from a version somebody has since replaced, and without a bump
    /// EF would issue no UPDATE at all and therefore no check.
    /// </para>
    /// <para>
    /// It also covers the changes EF records against a JSON column's owned
    /// entities rather than against the row — an edit that only rewrites an
    /// item's copies, say — which a state-based sweep of the change tracker
    /// alone would not see as a change to anything the aggregate names.
    /// </para>
    /// </remarks>
    void Touch(Collection collection);

    /// <summary>
    /// Every image id any collection anywhere in the installation points at:
    /// banners, icons and item photos, across <b>every</b> tenant.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The reachability set the garbage collector deletes against, and the one
    /// query in the app that is deliberately global. Two reasons it has to be:
    /// the collector runs outside a request, so there is no ambient tenant for
    /// the global filter to resolve; and nothing validates that a
    /// <c>BannerImageId</c> or a <c>PhotoIds</c> entry belongs to the tenant
    /// that wrote it, while the anonymous read endpoint resolves an id through
    /// the image's own row — so a cross-tenant reference is a reference that
    /// actually renders. A per-tenant answer would call it garbage.
    /// </para>
    /// <para>
    /// Over-collecting is the safe direction and under-collecting is the fatal
    /// one, so this deliberately returns a superset: an id that appears
    /// anywhere spares the image everywhere.
    /// </para>
    /// <para>
    /// The traversal must stay in step with
    /// <c>Vault.Application.Archives.CollectionImages.ReferencedBy</c>, which is
    /// the same reachability question asked of a single collection for the
    /// export and the import. <c>ImageReferenceCoverageTests</c> fails the build
    /// if a new image-shaped column appears in the model and neither is updated.
    /// </para>
    /// </remarks>
    Task<HashSet<Guid>> ListReferencedImageIdsAcrossAllTenantsAsync(CancellationToken ct);

    Task SaveChangesAsync(CancellationToken ct);
}
