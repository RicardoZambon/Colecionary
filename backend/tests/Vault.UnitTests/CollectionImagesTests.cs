using Vault.Application.Archives;
using Vault.Application.Collections.Dtos;

namespace Vault.UnitTests;

/// <summary>
/// Pins the one traversal that answers "which images does this collection
/// point at".
/// </summary>
/// <remarks>
/// <para>
/// Three consumers depend on the answer and each fails differently when it is
/// wrong: the export ships an archive missing a photo, the import restores a
/// collection with a broken picture, and the garbage collector destroys the
/// photograph. Only the third is permanent, which is why this is a unit test —
/// it runs wherever the suite runs, without a container.
/// </para>
/// <para>
/// The counting assertion is the load-bearing one. Positive assertions catch a
/// route that stops working; only asserting the total catches a route that was
/// never added, which is the failure that deletes data.
/// </para>
/// </remarks>
public class CollectionImagesTests
{
    private static readonly Guid Banner = Guid.NewGuid();
    private static readonly Guid Icon = Guid.NewGuid();
    private static readonly Guid Cover = Guid.NewGuid();
    private static readonly Guid Second = Guid.NewGuid();
    private static readonly Guid OtherItem = Guid.NewGuid();

    private static CollectionDto Populated() => new(
        "c1",
        "Every route at once",
        "",
        [],
        [
            Item("i1", [Cover, Second]),
            Item("i2", [OtherItem]),
        ],
        [],
        true,
        BannerImageId: Banner,
        IconImageId: Icon);

    [Fact]
    public void EveryWayACollectionCanNameAnImage_IsFound()
    {
        var found = CollectionImages.ReferencedBy(Populated());

        Assert.Contains(Banner, found);
        Assert.Contains(Icon, found);
        // photoIds[0] is the cover. It has no column of its own, so it must not
        // have a special case here either — and the second photo proves the
        // traversal does not stop at the cover.
        Assert.Contains(Cover, found);
        Assert.Contains(Second, found);
        Assert.Contains(OtherItem, found);

        // The count is what fails when a route is added to the model and not to
        // this traversal.
        Assert.Equal(5, found.Count);
    }

    [Fact]
    public void NullBannerAndIcon_ContributeNothing()
    {
        var found = CollectionImages.ReferencedBy(
            new CollectionDto("c1", "Bare", "", [], [Item("i1", [Cover])], [], true));

        Assert.Equal([Cover], found);
    }

    [Fact]
    public void ACollectionThatNamesNothing_IsEmpty_NotNull()
    {
        Assert.Empty(CollectionImages.ReferencedBy(
            new CollectionDto("c1", "Empty", "", [], [Item("i1", [])], [], true)));
    }

    [Fact]
    public void TheSameImageUsedTwice_IsOneReference()
    {
        var found = CollectionImages.ReferencedBy(new CollectionDto(
            "c1", "Reused", "", [], [Item("i1", [Banner])], [], true,
            BannerImageId: Banner, IconImageId: Banner));

        Assert.Equal([Banner], found);
    }

    [Fact]
    public void ItemImg_IsNotAReference()
    {
        // Img is a slug of the item's own name that the client renders as text.
        // If it ever became a real image reference the export would already be
        // dropping the photo and the import would already be breaking it, so it
        // is excluded here on purpose — and the garbage collector's reachability
        // query excludes it for the same reason. Pinned so the exclusion is a
        // decision rather than an oversight.
        var id = Guid.NewGuid();
        var found = CollectionImages.ReferencedBy(new CollectionDto(
            "c1", "Img", "", [],
            [
                new ItemDto("i1", "n", "", 2020, 0, "", [], id.ToString(), [], PhotoIds: []),
            ],
            [], true));

        Assert.Empty(found);
    }

    private static ItemDto Item(string id, IReadOnlyList<Guid> photoIds) =>
        new(id, "n", "", 2020, 0, "", [], "n.jpg", [], PhotoIds: photoIds);
}
