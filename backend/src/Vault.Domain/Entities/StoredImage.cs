using Vault.Domain.Abstractions;

namespace Vault.Domain.Entities;

/// <summary>
/// Metadata for an uploaded image (item photos, collection banners/icons). The
/// GUID id doubles as an unguessable capability for the anonymous read endpoint —
/// browsers can't attach Authorization headers to &lt;img&gt; requests.
/// </summary>
/// <remarks>
/// The bytes are NOT here: they live in an <c>IImageStore</c>, partitioned by
/// tenant. This row is what maps an id to its owning tenant, so it is still the
/// thing that makes the anonymous read safe — the read path resolves the tenant
/// from the row and only then goes to storage.
/// </remarks>
public class StoredImage : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    /// <summary>
    /// Immutable once written: the stored file's extension is derived from it,
    /// so changing it would orphan the bytes it names.
    /// </summary>
    public string ContentType { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>
    /// When the garbage collector first observed that nothing pointed at this
    /// image any more, or null while it is referenced (or has never been swept).
    /// </summary>
    /// <remarks>
    /// <para>
    /// This is the grace period's clock, and it exists because
    /// <see cref="CreatedAtUtc"/> cannot be it. Creation time answers "how old
    /// is this picture", which is the wrong question: a photo uploaded a year
    /// ago and dropped from an item this morning would be older than any grace
    /// period on its first sweep, and a full-document collection PUT — which
    /// today carries no optimistic concurrency — can drop a reference the user
    /// never meant to drop. Deleting on creation age would make that mistake
    /// instantly unrecoverable.
    /// </para>
    /// <para>
    /// So the sweep marks first and deletes later: it sets this the first time
    /// an image reads as unreferenced, <b>clears it back to null the moment
    /// anything points at the image again</b>, and only destroys bytes once the
    /// mark has stood for the whole grace period. Nothing is degraded while the
    /// mark stands — the image is still served, still exported, still framable —
    /// so an accidental dereference that is noticed and undone inside the window
    /// costs nothing at all.
    /// </para>
    /// <para>
    /// "The moment" is meant literally, and that is why saving a collection
    /// clears this column itself rather than leaving it to the next sweep. A
    /// sweep only learns what it looks at, so a reference that appeared and
    /// disappeared between two of them would never be observed, and the image
    /// would then be destroyed on a clock started before it was ever used — the
    /// real undo window would be the sweep interval, not the grace period.
    /// </para>
    /// <para>
    /// Null therefore means "believed referenced", which is the safe reading for
    /// every row that predates the column: the first sweep re-derives the truth
    /// and starts the clock from then, never from the past.
    /// </para>
    /// </remarks>
    public DateTimeOffset? UnreferencedSinceUtc { get; set; }

    /// <summary>
    /// Intrinsic pixel width, or null for a row written before sizes were
    /// recorded. Backfilled the first time the image is derived.
    /// </summary>
    /// <remarks>
    /// Carried so the client can reserve the right aspect ratio before any bytes
    /// arrive. Without it a gallery lays out at a guessed shape and then jumps
    /// when each photo loads — and the jump is worst exactly where it is most
    /// visible, on a slow connection loading a large picture.
    /// </remarks>
    public int? Width { get; set; }

    /// <summary>Intrinsic pixel height. See <see cref="Width"/>.</summary>
    public int? Height { get; set; }

    /// <summary>
    /// Horizontal focal point, 0–1 across the image. Null means never framed.
    /// </summary>
    /// <remarks>
    /// Null is meaningful and must survive round-trips: it distinguishes "the
    /// user never chose" (render centred, and a future subject-detection pass
    /// may fill it in) from "the user deliberately chose the centre". Same
    /// discipline as a copy's null <c>Value</c> meaning "inherit".
    /// <para>
    /// Framing is deliberately stored here rather than beside each reference to
    /// the image: where the subject sits is a property of the photograph, true
    /// wherever it is shown, so one adjustment fixes the card, the gallery and
    /// the banner at once. The bytes are never touched, which is what keeps the
    /// read endpoint's <c>immutable</c> caching honest.
    /// </para>
    /// </remarks>
    public double? FocalX { get; set; }

    /// <summary>Vertical focal point, 0–1 down the image. See <see cref="FocalX"/>.</summary>
    public double? FocalY { get; set; }
}
