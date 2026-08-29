using Microsoft.Extensions.Options;
using Vault.Application.Images;
using Vault.Infrastructure.Storage;

namespace Vault.Api.Infrastructure;

/// <summary>
/// Runs <see cref="ImageGarbageCollector"/> on a timer and writes down what it
/// did.
/// </summary>
/// <remarks>
/// <para>
/// A background service rather than an endpoint or a CLI, for three reasons.
/// The API contract mirrors the frontend's <c>VaultApi</c> one-for-one, so a new
/// route would be a contract change on both sides for something no user ever
/// calls. An endpoint that permanently deletes data is a new authenticated
/// attack surface bought for nothing. And a CLI would need its own host, its own
/// configuration and its own way of being scheduled, which is what this already
/// is.
/// </para>
/// <para>
/// It is registered only when <c>ImageGc:Enabled</c> is true, so on a
/// development machine and under the test host it does not exist at all. Even
/// enabled it reports and changes nothing until <c>ImageGc:DryRun</c> is also
/// turned off.
/// </para>
/// <para>
/// Nothing this service does may take the API down with it: a sweep that throws
/// is logged and the timer carries on. A maintenance job is never worth an
/// outage.
/// </para>
/// </remarks>
public sealed class ImageGarbageCollectionService(
    IServiceScopeFactory scopes,
    IOptions<ImageGcOptions> options,
    ILogger<ImageGarbageCollectionService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;

        logger.LogInformation(
            "Image garbage collection is enabled. DryRun={DryRun} GracePeriod={GracePeriod} "
            + "Interval={Interval} BatchSize={BatchSize} CollectOrphanFiles={CollectOrphanFiles}",
            settings.DryRun,
            settings.GracePeriod,
            settings.Interval,
            settings.BatchSize,
            settings.CollectOrphanFiles);

        try
        {
            await Task.Delay(settings.InitialDelay, stoppingToken);

            using var timer = new PeriodicTimer(settings.Interval);
            do
            {
                await SweepAsync(settings, stoppingToken);
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
            // Shutdown.
        }
    }

    private async Task SweepAsync(ImageGcOptions settings, CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var collector = scope.ServiceProvider.GetRequiredService<ImageGarbageCollector>();
            Report(await collector.SweepAsync(settings.ToPolicy(), ct));
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Deliberately swallowed: a failed sweep is a missed cleanup, and
            // the next one runs in a few hours. Bringing the API down over it
            // would turn a storage-hygiene problem into an outage.
            logger.LogError(ex, "Image garbage collection failed; the next sweep will retry.");
        }
    }

    /// <summary>
    /// Writes one line per destroyed thing and a summary. Per-image lines are
    /// what makes an accidental deletion investigable after the fact — the row
    /// is gone by then, so the log is the only remaining record of which id
    /// belonged to which tenant and how long it had been unreferenced.
    /// </summary>
    private void Report(ImageSweepReport report)
    {
        foreach (var image in report.Images)
        {
            logger.LogInformation(
                "{Verb} image {ImageId} of tenant {TenantId}, unreferenced since {UnreferencedSince} "
                + "({Files} files, {Bytes} bytes)",
                report.DryRun ? "Would collect" : "Collected",
                image.Id,
                image.TenantId,
                image.UnreferencedSinceUtc,
                image.Files,
                image.Bytes);
        }

        foreach (var orphan in report.Orphans)
        {
            logger.LogInformation(
                "{Verb} {Kind} file for image {ImageId} of tenant {TenantId}, last written "
                + "{LastWritten} ({Bytes} bytes, no metadata row)",
                report.DryRun ? "Would collect" : "Collected",
                orphan.Kind,
                orphan.ImageId,
                orphan.TenantId,
                orphan.LastWrittenUtc,
                orphan.Bytes);
        }

        if (report.ForeignTenantFilesSkipped > 0)
        {
            logger.LogWarning(
                "Skipped {Count} stored file(s) whose image id belongs to a different tenant's row. "
                + "These are never deleted; investigate the storage layout.",
                report.ForeignTenantFilesSkipped);
        }

        if (report.SparedByRecheck > 0)
        {
            logger.LogWarning(
                "{Count} image(s) were referenced again between the sweep's two reachability reads "
                + "and were spared.",
                report.SparedByRecheck);
        }

        logger.LogInformation(
            "Image sweep finished. DryRun={DryRun} Scanned={Scanned} Referenced={Referenced} "
            + "Marked={Marked} MarksCleared={MarksCleared} WaitingOutGrace={Waiting} "
            + "ImagesCollected={Collected} OrphanFilesCollected={Orphans} BytesFreed={Bytes}",
            report.DryRun,
            report.ImagesScanned,
            report.ReferencedIds,
            report.Marked,
            report.MarksCleared,
            report.WaitingOutGrace,
            report.Images.Count,
            report.Orphans.Count,
            report.BytesFreed);
    }
}
