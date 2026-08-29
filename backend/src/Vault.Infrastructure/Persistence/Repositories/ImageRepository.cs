using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Repositories;

public sealed class ImageRepository(VaultDbContext db) : IImageRepository
{
    public void Add(StoredImage image) => db.Images.Add(image);

    public Task<StoredImage?> GetUnfilteredAsync(Guid id, CancellationToken ct) =>
        db.Images.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(i => i.Id == id, ct);

    // Tracked on purpose: this is the read that precedes a write, so the change
    // tracker is what turns a property assignment into an UPDATE.
    public Task<StoredImage?> GetForCurrentTenantAsync(Guid id, CancellationToken ct) =>
        db.Images.FirstOrDefaultAsync(i => i.Id == id, ct);

    public Task<List<StoredImage>> ListForCurrentTenantAsync(CancellationToken ct) =>
        db.Images.AsNoTracking().OrderBy(i => i.CreatedAtUtc).ToListAsync(ct);

    public Task<List<StoredImage>> ListForCurrentTenantAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken ct) =>
        ids.Count == 0
            ? Task.FromResult(new List<StoredImage>())
            : db.Images.AsNoTracking()
                .Where(i => ids.Contains(i.Id))
                .OrderBy(i => i.CreatedAtUtc)
                .ToListAsync(ct);

    public async Task<IReadOnlyList<ImageSweepRow>> ListAllForSweepAsync(CancellationToken ct) =>
        await db.Images
            .IgnoreQueryFilters()
            .AsNoTracking()
            .OrderBy(i => i.CreatedAtUtc)
            .ThenBy(i => i.Id)
            .Select(i => new ImageSweepRow(
                i.Id, i.TenantId, i.ContentType, i.CreatedAtUtc, i.UnreferencedSinceUtc))
            .ToListAsync(ct);

    public Task<int> MarkUnreferencedAsync(
        IReadOnlyCollection<Guid> ids,
        DateTimeOffset atUtc,
        CancellationToken ct) =>
        // `UnreferencedSinceUtc == null` in the predicate, not just in the
        // caller: marking is idempotent and must never push an existing mark
        // forward, or a row could sit one sweep short of the grace period for
        // ever.
        InChunksAsync(
            ids,
            chunk => db.Images
                .IgnoreQueryFilters()
                .Where(i => chunk.Contains(i.Id) && i.UnreferencedSinceUtc == null)
                .ExecuteUpdateAsync(set => set.SetProperty(i => i.UnreferencedSinceUtc, atUtc), ct),
            ct);

    public Task<int> ClearUnreferencedMarkAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        InChunksAsync(
            ids,
            chunk => db.Images
                .IgnoreQueryFilters()
                .Where(i => chunk.Contains(i.Id) && i.UnreferencedSinceUtc != null)
                .ExecuteUpdateAsync(set => set.SetProperty(i => i.UnreferencedSinceUtc, (DateTimeOffset?)null), ct),
            ct);

    // No IgnoreQueryFilters: this one runs inside a request, on ids that came
    // from its body. See the interface for why the two differ.
    public Task<int> ClearUnreferencedMarkForCurrentTenantAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken ct) =>
        InChunksAsync(
            ids,
            chunk => db.Images
                .Where(i => chunk.Contains(i.Id) && i.UnreferencedSinceUtc != null)
                .ExecuteUpdateAsync(set => set.SetProperty(i => i.UnreferencedSinceUtc, (DateTimeOffset?)null), ct),
            ct);

    public Task<int> DeleteRowsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        InChunksAsync(
            ids,
            chunk => db.Images
                .IgnoreQueryFilters()
                .Where(i => chunk.Contains(i.Id))
                .ExecuteDeleteAsync(ct),
            ct);

    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);

    /// <summary>
    /// Runs a set-based statement over the ids in slices. SQL Server caps a
    /// command at 2 100 parameters, and a sweep can easily name more ids than
    /// that in one pass.
    /// </summary>
    private static async Task<int> InChunksAsync(
        IReadOnlyCollection<Guid> ids,
        Func<Guid[], Task<int>> run,
        CancellationToken ct)
    {
        const int chunkSize = 500;

        var affected = 0;
        foreach (var chunk in ids.Distinct().Chunk(chunkSize))
        {
            ct.ThrowIfCancellationRequested();
            affected += await run(chunk);
        }

        return affected;
    }
}
