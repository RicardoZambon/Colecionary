using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

/// <summary>
/// Aggregate-root repository for collections. All reads are implicitly
/// tenant-filtered by the DbContext's global query filters.
/// </summary>
/// <summary>Just enough of a collection to recognise it by name.</summary>
public sealed record CollectionIdentity(string Id, string Name);

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
    void ReplaceGraph(Collection tracked, Collection replacement);

    Task SaveChangesAsync(CancellationToken ct);
}
