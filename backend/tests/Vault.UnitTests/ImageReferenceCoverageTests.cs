using Microsoft.EntityFrameworkCore;
using Vault.Infrastructure.Persistence;

namespace Vault.UnitTests;

/// <summary>
/// Fails the build when a GUID-shaped column appears in the model that nobody
/// has classified as an image reference or as something else.
/// </summary>
/// <remarks>
/// <para>
/// The image garbage collector deletes what the reachability query does not
/// find, so a reference site added to the model and forgotten by
/// <c>ICollectionRepository.ListReferencedImageIdsAcrossAllTenantsAsync</c> is
/// not a stale query — it is photographs destroyed on a timer, permanently,
/// with no backup. A code comment asking the next person to remember is not a
/// control. This is.
/// </para>
/// <para>
/// The mechanism is deliberately dumb: every <c>Guid</c>, <c>Guid?</c> and
/// <c>Guid</c>-collection property in the built model must appear in one of the
/// two lists below. Adding a column therefore fails here until somebody says, in
/// writing, which kind it is — and if it is a reference, updating the sweep and
/// <c>CollectionImages.ReferencedBy</c> is what makes the test pass again.
/// </para>
/// <para>
/// Its blind spot is a reference stored as something other than a GUID — a
/// string column holding an id, say. <c>Item.Img</c> is the near miss: a
/// free-text column named like an image that holds a slug of the item's own
/// name. Nothing here would catch it becoming a real reference, which is why
/// that column carries its own argument in the repository.
/// </para>
/// </remarks>
public class ImageReferenceCoverageTests
{
    /// <summary>
    /// Columns the sweep treats as pointing at <c>Storage.Images</c>. Every one
    /// of these must be read by
    /// <c>ListReferencedImageIdsAcrossAllTenantsAsync</c> and remapped by
    /// <c>ImportService.Remap</c>.
    /// </summary>
    private static readonly string[] ImageReferences =
    [
        "Collection.BannerImageId",
        "Collection.IconImageId",
        // Ordered; PhotoIds[0] is the cover, which has no column of its own and
        // therefore needs no separate entry here.
        "Item.PhotoIds",
    ];

    /// <summary>
    /// GUID columns that are not image references, each with the reason it is
    /// not one. Entries are identities and tenancy, never a pointer at an image.
    /// </summary>
    private static readonly string[] NotImageReferences =
    [
        "Tenant.Id",                // The tenant itself.
        "User.Id",                  // A person.
        "User.TenantId",            // Tenancy.
        "Collection.TenantId",
        "CollectionMember.TenantId",
        "Group.TenantId",
        "Section.TenantId",     // Tenancy; a section carries no image of its own.
        "Item.TenantId",
        "StoredImage.TenantId",     // Which partition an image's own bytes live in.
        "StoredImage.Id",           // The image itself, not a reference to one.
    ];

    [Fact]
    public void EveryGuidShapedColumn_IsClassified()
    {
        var unclassified = GuidShapedProperties()
            .Where(name => !ImageReferences.Contains(name) && !NotImageReferences.Contains(name))
            .ToArray();

        Assert.Empty(unclassified);
    }

    [Fact]
    public void EveryClassifiedColumn_StillExistsInTheModel()
    {
        // The other direction: a column removed or renamed must not leave a
        // reference site in the list that nothing sweeps any more.
        var actual = GuidShapedProperties().ToHashSet();
        var stale = ImageReferences.Concat(NotImageReferences).Where(name => !actual.Contains(name)).ToArray();

        Assert.Empty(stale);
    }

    private static IEnumerable<string> GuidShapedProperties() =>
        new VaultDbContextFactory().CreateDbContext([]).Model
            .GetEntityTypes()
            .SelectMany(t => t.GetProperties()
                // Shadow properties are EF's own bookkeeping — the composite
                // foreign keys it synthesizes to tie a JSON-owned document to
                // its owner. Nobody writes them and nothing can point them at an
                // image, and their names belong to EF rather than to this model.
                .Where(p => !p.IsShadowProperty())
                .Select(p => new { Entity = t.ClrType.Name, Property = p }))
            .Where(x => IsGuidShaped(x.Property.ClrType))
            .Select(x => $"{x.Entity}.{x.Property.Name}")
            .Distinct()
            .Order();

    private static bool IsGuidShaped(Type type)
    {
        if (type == typeof(Guid) || type == typeof(Guid?))
        {
            return true;
        }

        // A primitive collection (List<Guid>) or any other enumerable of GUIDs.
        return type != typeof(string)
               && type.GetInterfaces()
                   .Concat([type])
                   .Any(i => i.IsGenericType
                             && i.GetGenericTypeDefinition() == typeof(IEnumerable<>)
                             && (i.GetGenericArguments()[0] == typeof(Guid)
                                 || i.GetGenericArguments()[0] == typeof(Guid?)));
    }
}
