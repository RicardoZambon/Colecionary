using Vault.Application.Abstractions;

namespace Vault.Application.Images;

/// <summary>
/// Reclaims image bytes and metadata rows that nothing points at any more.
/// </summary>
/// <remarks>
/// <para>
/// <b>Mark and sweep, never delete-on-dereference.</b> Removing a photo from an
/// item does not delete anything: the sweep records the first moment an image
/// read as unreferenced (<c>StoredImage.UnreferencedSinceUtc</c>) and only
/// destroys bytes once that mark has stood for the whole grace period. It is
/// shaped that way because of what dereferencing actually is in this app — a
/// full-document collection PUT with last-writer-wins semantics and, today, no
/// optimistic concurrency. Two open tabs, a partial client payload or a bad
/// merge can drop <c>photoIds</c> the user never meant to drop, and coupling an
/// irreversible delete to that endpoint would make the mistake instantly
/// unrecoverable. There is no backup and no undo anywhere in this system.
/// </para>
/// <para>
/// The mark is a better quarantine than moving bytes aside would be: while it
/// stands the image is not degraded in any way — still served, still exported,
/// still framable — and the moment anything references it again the mark is
/// cleared and the clock is thrown away. An accidental dereference noticed
/// inside the window costs nothing at all, and needs no restore procedure.
/// </para>
/// <para>
/// The sweep clears marks for everything it finds referenced, but it is not the
/// only thing that clears them: saving a collection does it directly, through
/// <c>ClearUnreferencedMarkForCurrentTenantAsync</c>. Without that, a reference
/// that appeared and disappeared entirely between two sweeps would be one the
/// collector never saw, and the image would be destroyed on a clock started
/// before it was ever used — making the real undo window the sweep interval
/// rather than the grace period.
/// </para>
/// <para>
/// The grace period is also what reconciles this with the whole-vault export,
/// which deliberately packs <em>every</em> image a tenant owns rather than only
/// the referenced ones, "since an image not currently on an item is still the
/// user's". That is a statement about a photo mid-workflow — uploaded from the
/// picker but not yet saved onto an item, which is a state this app reaches on
/// every single upload. A grace period measured in weeks keeps that promise;
/// what it stops keeping is the promise that a photo nothing has pointed at
/// since last month is still worth storing.
/// </para>
/// <para>
/// <b>Reachability is computed globally, across every tenant.</b> Nothing
/// validates that a banner, icon or photo id belongs to the tenant that wrote
/// it, and the anonymous read endpoint resolves an id through the image's own
/// row — so a cross-tenant reference is one that actually renders. A per-tenant
/// answer would call it garbage. Over-collecting the reference set is the safe
/// direction; under-collecting destroys photographs.
/// </para>
/// <para>
/// <b>Deletion is always addressed by the tenant on the image's own row</b>,
/// never by an ambient one — the same rule the anonymous read follows, and the
/// reason a sweep cannot wander into another tenant's storage.
/// </para>
/// </remarks>
public sealed class ImageGarbageCollector(
    ICollectionRepository collections,
    IImageRepository images,
    IImageStore store,
    TimeProvider timeProvider)
{
    public async Task<ImageSweepReport> SweepAsync(ImageGcPolicy policy, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(policy);
        if (policy.GracePeriod <= TimeSpan.Zero)
        {
            // The last line of defence. Configuration validation refuses
            // anything under an hour long before this, but a collector that
            // would delete on a zero grace is one bad binding away from being a
            // delete-on-dereference collector, so it refuses on its own account.
            throw new ArgumentOutOfRangeException(
                nameof(policy),
                policy.GracePeriod,
                "The image garbage collector requires a positive grace period.");
        }

        // Order matters: references first, rows second. Read the other way round
        // a reference written between the two reads would be invisible while the
        // image row it points at was already in hand.
        var referenced = await collections.ListReferencedImageIdsAcrossAllTenantsAsync(ct);
        var rows = await images.ListAllForSweepAsync(ct);
        var now = timeProvider.GetUtcNow();

        var unreferenced = rows.Where(r => !referenced.Contains(r.Id)).ToArray();

        var toMark = unreferenced
            .Where(r => r.UnreferencedSinceUtc is null)
            .Select(r => r.Id)
            .ToArray();

        var toClear = rows
            .Where(r => referenced.Contains(r.Id) && r.UnreferencedSinceUtc is not null)
            .Select(r => r.Id)
            .ToArray();

        // Ripe on two independent clocks. The mark is the one that matters; the
        // creation stamp is a second opinion that costs nothing and covers the
        // window between a photo being uploaded from the picker and the item
        // that will carry it being saved — a window with no upper bound, since
        // the form can sit open indefinitely.
        var ripe = unreferenced
            .Where(r => r.UnreferencedSinceUtc is { } since
                        && now - since >= policy.GracePeriod
                        && now - r.CreatedAtUtc >= policy.GracePeriod)
            .OrderBy(r => r.UnreferencedSinceUtc)
            .ToArray();

        var marked = toMark.Length;
        var cleared = toClear.Length;
        if (!policy.DryRun)
        {
            // Clearing before marking, always. Restoring an image to "in use" is
            // never the dangerous direction, and doing it first means a sweep
            // interrupted halfway has un-marked live images rather than marked
            // ones it never got to clear.
            cleared = await images.ClearUnreferencedMarkAsync(toClear, ct);
            marked = await images.MarkUnreferencedAsync(toMark, now, ct);
        }

        var (collected, spared) = await CollectImagesAsync(policy, ripe, ct);

        // A dry run deleted nothing, so every row is still live. Without that
        // distinction an image the sweep reported as collectable would be
        // reported a second time as a file with no row, and the report would
        // read as twice the work it is.
        var deleted = policy.DryRun ? [] : collected.Select(c => c.Id).ToHashSet();
        var live = rows
            .Where(r => !deleted.Contains(r.Id))
            .ToDictionary(r => r.Id, r => r.TenantId);

        var (orphans, foreign) = policy.CollectOrphanFiles
            ? await CollectOrphansAsync(policy, live, referenced, now, ct)
            : ([], 0);

        return new ImageSweepReport(
            policy.DryRun,
            rows.Count,
            referenced.Count,
            marked,
            cleared,
            unreferenced.Length - ripe.Length,
            spared,
            foreign,
            collected,
            orphans);
    }

    /// <summary>
    /// Destroys one batch of ripe images, row first and bytes second.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The batch is re-checked against a <em>freshly read</em> reference set
    /// immediately before anything is destroyed. The marks were written moments
    /// ago and a collection PUT could have landed since; two independent
    /// observations, taken either side of that write, both saying "nothing
    /// points at this" is materially stronger than one. It does not close the
    /// window completely — only a lock across the whole catalogue would, and
    /// blocking every writer for a maintenance job is a worse trade — but it
    /// narrows it from the length of a sweep to the length of a delete.
    /// </para>
    /// <para>
    /// Row before bytes, deliberately the mirror of how an image is created
    /// (bytes before row). Either order can be interrupted; this one leaves a
    /// file nothing names, which the stray-file pass reclaims later, rather than
    /// a row whose bytes are already gone, which is a broken picture on screen.
    /// </para>
    /// </remarks>
    private async Task<(List<CollectedImage> Collected, int Spared)> CollectImagesAsync(
        ImageGcPolicy policy,
        IReadOnlyList<ImageSweepRow> ripe,
        CancellationToken ct)
    {
        var collected = new List<CollectedImage>();
        if (ripe.Count == 0 || policy.BatchSize <= 0)
        {
            return (collected, 0);
        }

        var batch = ripe.Take(policy.BatchSize).ToArray();
        var confirmed = await collections.ListReferencedImageIdsAcrossAllTenantsAsync(ct);
        var doomed = batch.Where(r => !confirmed.Contains(r.Id)).ToArray();
        var spared = batch.Length - doomed.Length;

        if (doomed.Length == 0)
        {
            return (collected, spared);
        }

        if (policy.DryRun)
        {
            collected.AddRange(doomed.Select(r =>
                new CollectedImage(r.Id, r.TenantId, r.UnreferencedSinceUtc!.Value, 0, 0)));
            return (collected, spared);
        }

        await images.DeleteRowsAsync([.. doomed.Select(r => r.Id)], ct);

        foreach (var row in doomed)
        {
            // row.TenantId, never an ambient tenant: the image's own row is the
            // only thing that says which partition holds its bytes, and the same
            // id under another tenant would be a different picture.
            var removed = await store.DeleteAsync(row.TenantId, row.Id, row.ContentType, ct);
            collected.Add(new CollectedImage(
                row.Id, row.TenantId, row.UnreferencedSinceUtc!.Value, removed.Files, removed.Bytes));
        }

        return (collected, spared);
    }

    /// <summary>
    /// Reclaims bytes no metadata row has ever named.
    /// </summary>
    /// <remarks>
    /// Uploads and imports both write bytes before the row, so a crash in
    /// between leaves a file that no database query can see — the same gap that
    /// makes an honest storage quota impossible. Three guards keep this from
    /// being the dangerous half of the sweep: a file is only a candidate once it
    /// is older than the whole grace period (an in-flight write is milliseconds
    /// old, not weeks); an id that still has a row anywhere is never touched;
    /// and a file whose id belongs to a <em>different</em> tenant's row is
    /// reported and left alone rather than resolved either way.
    /// </remarks>
    private async Task<(List<CollectedObject> Orphans, int ForeignSkipped)> CollectOrphansAsync(
        ImageGcPolicy policy,
        Dictionary<Guid, Guid> live,
        HashSet<Guid> referenced,
        DateTimeOffset now,
        CancellationToken ct)
    {
        var orphans = new List<CollectedObject>();
        var foreign = 0;
        if (policy.BatchSize <= 0)
        {
            return (orphans, foreign);
        }

        var cutoff = now - policy.GracePeriod;

        await foreach (var stored in store.EnumerateAsync(ct))
        {
            if (orphans.Count >= policy.BatchSize)
            {
                break;
            }

            if (stored.LastWrittenUtc > cutoff)
            {
                continue;
            }

            if (stored.ImageId is not { } imageId)
            {
                // The store could not say which image these bytes belong to, so
                // nobody can say they belong to nobody. Never a candidate.
                continue;
            }

            // A staging file is garbage by construction and is checked against
            // the clock alone: the write that made it moves it into place, so
            // one that survives is a write that never finished, and the finished
            // bytes either sit at the real path or were never written. Holding
            // it back because its image is still live would leak it for ever.
            if (stored.Kind is not StoredObjectKind.Staging)
            {
                if (live.TryGetValue(imageId, out var owner))
                {
                    if (owner != stored.TenantId)
                    {
                        // The row says a different tenant owns this id, so these
                        // bytes are unreachable through the app — but they are
                        // also somebody's picture sitting in the wrong place,
                        // and that is not a thing to resolve by unlinking it.
                        foreign++;
                    }

                    continue;
                }

                // Named by a collection even though its row has gone: a strange
                // state, and not one to resolve by deleting bytes either.
                if (referenced.Contains(imageId))
                {
                    continue;
                }
            }

            if (!policy.DryRun && !await store.DeleteObjectAsync(stored, ct))
            {
                continue;
            }

            orphans.Add(new CollectedObject(
                stored.TenantId, stored.ImageId, stored.Kind, stored.LastWrittenUtc, stored.SizeBytes));
        }

        return (orphans, foreign);
    }
}
