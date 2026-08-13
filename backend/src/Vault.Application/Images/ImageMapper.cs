using Vault.Application.Images.Dtos;
using Vault.Domain.Entities;

namespace Vault.Application.Images;

public static class ImageMapper
{
    /// <summary>Projects a stored image row onto the wire shape.</summary>
    /// <remarks>
    /// Both coordinates must be present for the pair to mean anything, so a
    /// half-written row degrades to "never framed" rather than to a point on an
    /// edge the user never picked. Shared with the export so an archive and the
    /// API can never disagree about what a row means.
    /// </remarks>
    public static ImageMetaDto ToMeta(this StoredImage image) => new(
        image.Id,
        image.ContentType,
        image is { FocalX: { } x, FocalY: { } y } ? new FocalPointDto(x, y) : null);
}
