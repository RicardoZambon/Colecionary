using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

/// <summary>
/// Aggregate-root repository for collections. All reads are implicitly
/// tenant-filtered by the DbContext's global query filters.
/// </summary>
public interface ICollectionRepository
{
    Task<List<Collection>> ListAsync(CancellationToken ct);

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
