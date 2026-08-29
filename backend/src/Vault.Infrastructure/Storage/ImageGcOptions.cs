using System.ComponentModel.DataAnnotations;
using Vault.Application.Images;

namespace Vault.Infrastructure.Storage;

/// <summary>
/// Tuning for the image garbage collector, bound from the <c>ImageGc</c>
/// configuration section.
/// </summary>
/// <remarks>
/// Unlike every other options type here, the defaults are deliberately
/// <em>inert</em>: this is the only code in the application that destroys user
/// data permanently, and there is no backup and no undo. Two separate,
/// deliberate acts are needed before a byte can be lost — turning
/// <see cref="Enabled"/> on, and then turning <see cref="DryRun"/> off — and the
/// first of those only ever produces a report.
/// </remarks>
public sealed class ImageGcOptions
{
    /// <summary>Configuration section these values bind from.</summary>
    public const string SectionName = "ImageGc";

    /// <summary>
    /// The shortest grace period an operator may configure. A grace measured in
    /// minutes is not a grace — it is delete-on-dereference with extra steps —
    /// and the whole point of the design is that an accidental dereference has
    /// time to be noticed.
    /// </summary>
    public static readonly TimeSpan MinimumGracePeriod = TimeSpan.FromHours(1);

    /// <summary>
    /// Longest span the background service's timers accept. <c>Task.Delay</c>
    /// and <c>PeriodicTimer</c> both throw above roughly 49.7 days, and that
    /// exception would escape a <c>BackgroundService</c> and stop the host — a
    /// maintenance setting taking the API down, which is the one thing the
    /// collector must never do.
    /// </summary>
    public static readonly TimeSpan MaximumTimerSpan = TimeSpan.FromDays(45);

    /// <summary>
    /// Master switch, <b>off</b> by default. With it off the background service
    /// is never even registered, so a development machine, a test host and a
    /// deployment whose operator has not read the documentation all behave
    /// identically: nothing is swept and nothing can be lost.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Report without destroying anything, <b>on</b> by default. A dry run
    /// computes the whole sweep — reachability, marks, ripeness, stray files —
    /// and logs exactly what it would have removed, while writing nothing at
    /// all, not even the marks. Turning this off is the second of the two
    /// deliberate acts.
    /// </summary>
    public bool DryRun { get; set; } = true;

    /// <summary>
    /// How long an image must have read as unreferenced before its bytes may be
    /// destroyed. Thirty days is a recycle bin, not a timeout: long enough that
    /// a dereference nobody intended — a stale full-document PUT from a second
    /// tab, a collection deleted by mistake, a photo removed and meant to be put
    /// back — is noticed and undone by a human before anything is lost, and long
    /// enough to cover a photo uploaded from the picker onto an item the user
    /// has not got round to saving.
    /// </summary>
    public TimeSpan GracePeriod { get; set; } = TimeSpan.FromDays(30);

    /// <summary>How often a sweep runs.</summary>
    public TimeSpan Interval { get; set; } = TimeSpan.FromHours(6);

    /// <summary>
    /// How long after startup the first sweep waits. Keeps a maintenance scan
    /// off the critical path of a deploy, and gives an operator watching a
    /// misconfigured rollout a moment to stop the process.
    /// </summary>
    public TimeSpan InitialDelay { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Most images — and, separately, most stray files — one sweep may remove.
    /// Bounds the blast radius of a single run: a mistake big enough to matter
    /// takes many sweeps and many hours to become one, which is time to notice
    /// it in the logs.
    /// </summary>
    [Range(1, 100_000)]
    public int BatchSize { get; set; } = 200;

    /// <summary>
    /// Whether to also reclaim bytes that no metadata row has ever named — the
    /// residue of an upload or an import that died between writing the file and
    /// committing the row. Separate from the rest of the sweep because it is the
    /// only part that reasons from storage rather than from the database.
    /// </summary>
    public bool CollectOrphanFiles { get; set; } = true;

    /// <summary>The dials, as the collector wants them.</summary>
    public ImageGcPolicy ToPolicy() =>
        new(GracePeriod, BatchSize, DryRun, CollectOrphanFiles);
}
