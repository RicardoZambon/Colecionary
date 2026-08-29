using Vault.Application.Abstractions;

namespace Vault.Application.Images;

/// <summary>
/// The dials one sweep runs at. A value object rather than an options type so
/// the collector stays free of the hosting stack and can be exercised without
/// one; <c>Vault.Infrastructure.Storage.ImageGcOptions</c> is what binds these
/// from configuration.
/// </summary>
/// <param name="GracePeriod">
/// How long an image must have read as unreferenced before its bytes may be
/// destroyed. This is the whole safety property — see
/// <see cref="ImageGarbageCollector"/>.
/// </param>
/// <param name="BatchSize">
/// Most images (and, separately, most stray files) one sweep may delete. Bounds
/// the blast radius of any single run and keeps a first sweep over a long-lived
/// vault from being one enormous transaction.
/// </param>
/// <param name="DryRun">
/// When true the sweep computes and reports exactly what it would do and
/// changes nothing at all — not even the marks.
/// </param>
/// <param name="CollectOrphanFiles">
/// Whether to also remove bytes that no metadata row has ever named. Separate
/// because it is the only part of the sweep that reasons from storage rather
/// than from the database.
/// </param>
public sealed record ImageGcPolicy(
    TimeSpan GracePeriod,
    int BatchSize,
    bool DryRun,
    bool CollectOrphanFiles);

/// <summary>An image the sweep collected, or would have.</summary>
public sealed record CollectedImage(
    Guid Id,
    Guid TenantId,
    DateTimeOffset UnreferencedSinceUtc,
    int Files,
    long Bytes);

/// <summary>A stray file the sweep collected, or would have.</summary>
public sealed record CollectedObject(
    Guid TenantId,
    Guid? ImageId,
    StoredObjectKind Kind,
    DateTimeOffset LastWrittenUtc,
    long Bytes);

/// <summary>What one sweep found and did. Everything the operator's log needs.</summary>
public sealed record ImageSweepReport(
    bool DryRun,
    int ImagesScanned,
    int ReferencedIds,
    int Marked,
    int MarksCleared,
    int WaitingOutGrace,
    int SparedByRecheck,
    int ForeignTenantFilesSkipped,
    IReadOnlyList<CollectedImage> Images,
    IReadOnlyList<CollectedObject> Orphans)
{
    /// <summary>
    /// Bytes actually reclaimed. Zero for the images half of a dry run: sizing
    /// what is still on disk would mean stat-ing files the sweep has decided not
    /// to touch, and the question a dry run answers is <em>what</em>, not
    /// <em>how much</em>. Stray files are sized either way, because enumerating
    /// them reports their size anyway.
    /// </summary>
    public long BytesFreed => Images.Sum(i => i.Bytes) + Orphans.Sum(o => o.Bytes);
}
