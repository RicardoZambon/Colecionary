using Vault.Application.Archives;
using Vault.Application.Collections.Dtos;
using Vault.Application.Import;

namespace Vault.UnitTests;

/// <summary>
/// The parts of an archive that are pure functions of their input: what a
/// download is named, and how an archived collection's ids are made acceptable
/// to an API that grew stricter than the data already in the vault.
/// </summary>
public class ArchiveTests
{
    [Theory]
    [InlineData("Retro Consoles", "retro", "vault-retro-consoles.zip")]
    [InlineData("Ficção Científica", "scifi", "vault-ficcao-cientifica.zip")]
    [InlineData("  Coins / Notes  ", "coins", "vault-coins-notes.zip")]
    // Nothing in the name survives an ASCII fold, so the id carries it instead.
    [InlineData("収集", "kanji-set", "vault-kanji-set.zip")]
    // Neither does, so the download is still a file rather than "vault-.zip".
    [InlineData("収集", "★", "vault-collection.zip")]
    public void CollectionFileName_FoldsToAReadableAsciiSlug(string name, string id, string expected) =>
        Assert.Equal(expected, ArchiveFileName.ForCollection(name, id));

    [Fact]
    public void CollectionFileName_StaysWithinAReasonableLength()
    {
        var name = ArchiveFileName.ForCollection(new string('a', 500), "long");
        Assert.True(name.Length < 80, name);
    }

    [Fact]
    public void Compatibility_ReadsAnArchiveWithNoManifestAtAll()
    {
        // Predates the manifest — and is therefore v1, which this build reads.
        Assert.Equal(ArchiveReadability.Readable, ArchiveCompatibility.Check(null));
    }

    [Fact]
    public void Compatibility_ReadsTodaysArchiveAndOlderOnes()
    {
        Assert.Equal(
            ArchiveReadability.Readable,
            ArchiveCompatibility.Check(Manifest(ArchiveManifest.CurrentVersion)));
        Assert.Equal(ArchiveReadability.Readable, ArchiveCompatibility.Check(Manifest(1)));
    }

    [Fact]
    public void Compatibility_RefusesAnArchiveFromANewerVersion()
    {
        // The failure this prevents is not a crash: today's reader would parse a
        // v2 document happily and write whatever it made of it into the vault.
        Assert.Equal(
            ArchiveReadability.FromANewerVersion,
            ArchiveCompatibility.Check(Manifest(ArchiveManifest.CurrentVersion + 1)));
    }

    [Fact]
    public void Compatibility_RefusesAZipThatClaimsToBeSomethingElse()
    {
        Assert.Equal(
            ArchiveReadability.ForeignFormat,
            ArchiveCompatibility.Check(Manifest(1, format: "some-other-tool")));
    }

    [Fact]
    public void Compatibility_TreatsAnUnlabelledManifestAsOurOwn()
    {
        // Ours, from before the field was populated — not a foreign file.
        Assert.Equal(ArchiveReadability.Readable, ArchiveCompatibility.Check(Manifest(1, format: "")));
    }

    private static ArchiveManifest Manifest(int version, string? format = null) => new(
        format ?? ArchiveManifest.FormatName,
        version,
        ArchiveManifest.CollectionKind,
        DateTimeOffset.UnixEpoch);

    [Fact]
    public void IdRepair_LeavesAWellFormedCollectionExactlyAsItWas()
    {
        var source = Collection(
            groups: [Group("g1", "Nintendo", null), Group("g2", "Handhelds", "g1")],
            items: [Item("nes", "g1", copyId: "nes_c1")]);

        var repaired = PublicIdRepair.Apply(source);

        // Compared field by field, not as whole records: a record's generated
        // equality compares its list properties by reference, so a rebuilt-but-
        // identical collection would never equal the original.
        Assert.Equal(["g1", "g2"], repaired.Groups.Select(g => g.Id));
        Assert.Equal([null, "g1"], repaired.Groups.Select(g => g.ParentId));
        Assert.Equal(["nes"], repaired.Items.Select(i => i.Id));
        Assert.Equal(["g1"], repaired.Items.Select(i => i.GroupId));
        Assert.Equal(["nes_c1"], repaired.Items.SelectMany(i => i.Copies).Select(c => c.Id));
    }

    [Fact]
    public void IdRepair_ReplacesIdsTheApiWouldRefuse_AndRepointsEveryReference()
    {
        // Exactly what a Store checklist and the demo seed produce: the group's
        // display name doubling as its id.
        var source = Collection(
            groups: [Group("Launch era", "Launch era", null), Group("Pokémon", "Pokémon", "Launch era")],
            items: [Item("first item", "Pokémon", copyId: "copy one")]);

        var repaired = PublicIdRepair.Apply(source);

        var root = repaired.Groups[0];
        var child = repaired.Groups[1];
        Assert.NotEqual("Launch era", root.Id);
        Assert.NotEqual("Pokémon", child.Id);

        // The tree still stands, and the item is still in the same group.
        Assert.Equal(root.Id, child.ParentId);
        Assert.Equal(child.Id, repaired.Items[0].GroupId);

        // Names are what the user sees; only the handles changed.
        Assert.Equal("Launch era", root.Name);
        Assert.Equal("Pokémon", child.Name);

        Assert.NotEqual("first item", repaired.Items[0].Id);
        Assert.NotEqual("copy one", repaired.Items[0].Copies[0].Id);
    }

    [Fact]
    public void IdRepair_KeepsTheUngroupedBucketUngrouped()
    {
        var repaired = PublicIdRepair.Apply(Collection(
            groups: [Group("Launch era", "Launch era", null)],
            items: [Item("loose", groupId: string.Empty, copyId: "c1")]));

        // "" is not a group id, it is the absence of one, and a rewrite that
        // treated it as a key would file every loose item under a real group.
        Assert.Equal(string.Empty, repaired.Items[0].GroupId);
    }

    [Fact]
    public void IdRepair_RootsAGroupWhoseParentIsBothMissingAndMalformed()
    {
        var repaired = PublicIdRepair.Apply(Collection(
            groups: [Group("g1", "Orphan", "a parent that left")],
            items: []));

        // A dangling parent is tolerated by this model, but a malformed one
        // would fail validation and take the whole restore down with it.
        Assert.Null(repaired.Groups[0].ParentId);
    }

    [Fact]
    public void IdRepair_KeepsADanglingParentThatIsAtLeastWellFormed()
    {
        var repaired = PublicIdRepair.Apply(Collection(
            groups: [Group("g1", "Orphan", "g-deleted")],
            items: []));

        Assert.Equal("g-deleted", repaired.Groups[0].ParentId);
    }


    [Fact]
    public void IdRepair_RepointsAnItemAtItsSection_AndTheSectionAtItsGroup()
    {
        // The same story as groups, one level down: a section id the API would
        // refuse is replaced, and both references to it have to follow — the
        // section's own group, and every item filed under it.
        var source = Collection(
            groups: [Group("Espanha", "Espanha", null)],
            items: [Item("first item", "Espanha", "copy one", sectionId: "Cavaleiros de Bronze")],
            sections: [Section("Cavaleiros de Bronze", "Espanha", "Cavaleiros de Bronze")]);

        var repaired = PublicIdRepair.Apply(source);

        var group = repaired.Groups[0];
        var section = repaired.Sections[0];
        Assert.NotEqual("Cavaleiros de Bronze", section.Id);
        Assert.Equal(group.Id, section.GroupId);
        Assert.Equal(section.Id, repaired.Items[0].SectionId);

        // Only the handle moved; the label is what the user sees.
        Assert.Equal("Cavaleiros de Bronze", section.Name);
    }

    [Fact]
    public void IdRepair_KeepsAnUnsectionedItemUnsectioned()
    {
        var repaired = PublicIdRepair.Apply(Collection(
            groups: [Group("g1", "Espanha", null)],
            items: [Item("i1", "g1", "c1")],
            sections: [Section("s1", "g1", "Bronze")]));

        // "" is the absence of a section, not a key — rewriting it would file
        // every loose item under whichever divider happened to be first.
        Assert.Equal(string.Empty, repaired.Items[0].SectionId);
    }

    [Fact]
    public void Archive_WrittenBeforeSectionsExisted_ReadsAsACollectionWithNone()
    {
        // The DTO is the archive format, so the field has to be optional on the
        // wire and normalise to empty: an old export must restore, not fail.
        var old = new CollectionDto("c1", "Test", string.Empty, [], [], [], LinkShare: true);

        Assert.Empty(old.Sections);
        Assert.Empty(PublicIdRepair.Apply(old).Sections);
    }

    private static CollectionDto Collection(
        List<GroupNodeDto> groups,
        List<ItemDto> items,
        List<SectionDto>? sections = null) =>
        new("c1", "Test", string.Empty, groups, items, [], LinkShare: true, Sections: sections);

    private static GroupNodeDto Group(string id, string name, string? parentId) =>
        new(id, name, parentId, []);

    private static SectionDto Section(string id, string groupId, string name) =>
        new(id, groupId, name);

    private static ItemDto Item(string id, string groupId, string copyId, string? sectionId = null) =>
        new(
            id,
            "Item",
            string.Empty,
            1990,
            10m,
            groupId,
            [],
            string.Empty,
            [],
            [new ItemCopyDto(copyId, "Mint", 5m)],
            SectionId: sectionId);
}
