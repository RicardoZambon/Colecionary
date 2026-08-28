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
