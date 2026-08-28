using Vault.Application.Collections.Dtos;

namespace Vault.Application.Archives;

/// <summary>
/// Which images a collection actually points at.
/// </summary>
/// <remarks>
/// Shared by the export and the import on purpose. The export packs exactly
/// this set, and the import copies exactly this set — one traversal, so a
/// reference the export learns to carry can never be one the import forgets to
/// remap. Everything reachable from a collection is here: the banner, the icon
/// and every item photo.
/// </remarks>
public static class CollectionImages
{
    public static HashSet<Guid> ReferencedBy(CollectionDto collection)
    {
        var ids = new HashSet<Guid>();

        if (collection.BannerImageId is { } banner)
        {
            ids.Add(banner);
        }

        if (collection.IconImageId is { } icon)
        {
            ids.Add(icon);
        }

        foreach (var photoId in collection.Items.SelectMany(item => item.PhotoIds))
        {
            ids.Add(photoId);
        }

        return ids;
    }
}
