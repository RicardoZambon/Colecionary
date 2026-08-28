namespace Vault.Application.Images.Dtos;

/// <summary>
/// Where the subject of an image sits, as fractions of its width and height
/// (0–1, origin top-left). Surfaces render it as a CSS background-position, so
/// the same point works for every aspect ratio the app crops to.
/// </summary>
public sealed record FocalPointDto(double X, double Y);

/// <summary>
/// An image's metadata. Deliberately carries no URL: callers already compose
/// <c>/api/images/{id}</c> themselves, and the bytes are a separate request.
/// </summary>
/// <remarks>
/// <c>Focal</c> is null when the image was never framed — the client renders it
/// centred. It travels as one nullable object rather than two loose coordinates
/// for the same reason <c>GroupSortDto</c> does: half a configuration is not a
/// configuration, and an x with no y has no meaning to render.
/// <para>
/// <c>Width</c>/<c>Height</c> are the intrinsic pixel size, null for an image
/// uploaded before sizes were recorded and not yet derived. The client uses them
/// to reserve the right shape before the bytes arrive; null means "lay out
/// without a hint". They travel as a pair for the same reason the focal
/// coordinates do.
/// </para>
/// </remarks>
public sealed record ImageMetaDto(
    Guid Id,
    string ContentType,
    FocalPointDto? Focal,
    int? Width = null,
    int? Height = null);

/// <summary>
/// Body of <c>PUT /api/images/{id}/focal</c>. A null <see cref="Focal"/> clears
/// the framing back to centred, which is how the editor's "reset" works.
/// </summary>
public sealed record SetFocalRequest(FocalPointDto? Focal);
