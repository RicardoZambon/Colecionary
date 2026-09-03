using Vault.Domain.Entities;
using Vault.Domain.Enums;
using Vault.Domain.ValueObjects;

namespace Vault.Infrastructure.Persistence.Seeding;

/// <summary>
/// Demo dataset — a 1:1 port of frontend/src/app/core/api/seed-data.ts.
/// Ids are copied verbatim so frontend deep links (?g=…) behave identically.
/// </summary>
public static class SeedData
{
    public const string TenantSlug = "acme-vault";

    public static Tenant Tenant(Guid tenantId) => new()
    {
        Id = tenantId,
        Slug = TenantSlug,
        Name = "Acme Vault",
    };

    public static List<User> Users(Guid tenantId) =>
    [
        new() { Id = Guid.NewGuid(), TenantId = tenantId, Email = "marcus@example.com", Name = "Marcus Keller", Initials = "MK", Role = MemberRole.Owner, Plan = PlanId.Free },
        new() { Id = Guid.NewGuid(), TenantId = tenantId, Email = "ana@example.com", Name = "Ana Pereira", Initials = "AP", Role = MemberRole.Editor, Plan = PlanId.Free },
        new() { Id = Guid.NewGuid(), TenantId = tenantId, Email = "dev@example.com", Name = "Dev Lee", Initials = "DL", Role = MemberRole.Viewer, Plan = PlanId.Free },
    ];

    public static List<Collection> Collections(Guid tenantId)
    {
        List<Collection> collections =
        [
            new()
            {
                Id = "retro",
                Name = "Retro Consoles",
                Description = "Boxed + loose hardware, NES → GameCube era",
                // One field of each new kind, both declared for the whole
                // collection rather than for a group. "Shelf" is not taxonomy —
                // where a console is kept has nothing to do with who made it —
                // and "Box condition" describes a physical unit, so the boxed
                // SNES and its yellowed spare answer it differently.
                Fields =
                [
                    Field("Shelf"),
                    Field("Box condition", scope: FieldScope.Copy),
                ],
                Groups = FlatGroups("retro",
                    ("Nintendo", new[] { "Serial no.", "Region", "Completeness", "Edition" }),
                    ("Sega", new[] { "Accessories" }),
                    ("Handhelds", new[] { "Screen", "Mods" }),
                    ("Atari", [])),
                Members =
                [
                    Member("retro", "Ana Pereira", "ana@example.com", "AP", MemberRole.Editor),
                    Member("retro", "Dev Lee", "dev@example.com", "DL", MemberRole.Viewer),
                ],
                Items =
                [
                    Item("retro", "nes", "NES Console (boxed)", 1985, Condition.Mint, 340, 260, "Nintendo", ["boxed", "cib"], "nes_console.jpg", "Complete-in-box NES-001 with original styrofoam, manuals, two controllers and Zapper. Shell has almost no yellowing; tested and working.", Custom(("Serial no.", "N8054321"), ("Region", "NTSC-U"), ("Completeness", "CIB — console, box, manuals"), ("Shelf", "A1 — living room"))),
                    Item("retro", "snes", "SNES (PAL)", 1992, Condition.Good, 120, 70, "Nintendo", ["loose"], "snes_pal.jpg", "Loose PAL SNES, one controller. Light yellowing on the top shell, ports clean.", Custom(("Region", "PAL"), ("Shelf", "A2 — living room")), extraCopies: [Copy("snes_c2", Condition.Fair, 45, CopyStatus.ForSale, value: 80, acquiredOn: new DateOnly(2023, 11, 2), notes: "Yellowed spare with a scuffed shell — parts donor or a cheap sale.", custom: Custom(("Box condition", "No box")))]),
                    Item("retro", "gameboy", "Game Boy DMG-01", 1989, Condition.Fair, 85, 40, "Handhelds", ["loose"], "gameboy_dmg.jpg", "Original DMG with a few dead pixel lines. Candidate for an IPS screen mod.", Custom(("Screen", "2 dead lines"), ("Mods", "None (IPS planned)"))),
                    Item("retro", "n64", "N64 Gold Edition", 1998, Condition.Mint, 610, 420, "Nintendo", ["cib", "rare"], "n64_gold.jpg", "Toys \"R\" Us exclusive gold console, complete in box with matching gold controller. The crown of the Nintendo shelf.", Custom(("Edition", "Gold — TRU exclusive"), ("Serial no.", "NS1189223"))),
                    Item("retro", "famicom", "Famicom (JP)", 1983, Condition.Good, 210, 140, "Nintendo", ["boxed", "import"], "famicom.jpg", "Japanese import Famicom with hardwired controllers, boxed. Box has shelf wear.", Custom(("Region", "NTSC-J"))),
                    Item("retro", "gamecube", "GameCube (indigo)", 2001, Condition.Mint, 95, 60, "Nintendo", ["loose"], "gamecube.jpg", "Indigo GameCube with one controller and memory card. Near-perfect shell.", Custom(("Accessories", "1 controller, 59-block card"))),
                    Item("retro", "virtualboy", "Virtual Boy", 1995, Condition.Good, 450, 300, "Nintendo", ["cib", "rare"], "virtualboy.jpg", "Complete Virtual Boy with stand and box. Displays tested — no rare solder-joint flicker.", Custom(("Displays", "Both OK"))),
                    Item("retro", "dreamcast", "Sega Dreamcast", 1999, Condition.Good, 180, 110, "Sega", ["loose"], "dreamcast.jpg", "Loose Dreamcast with VMU and controller. GD-ROM drive reads flawlessly.", Custom(("Accessories", "VMU, 1 controller"))),
                    Item("retro", "saturn", "Sega Saturn", 1995, Condition.Good, 220, 0, "Sega", ["wanted"], "sega_saturn.jpg", "On the hunt — looking for a clean model 2 with matching serials.", [], owned: false),
                    Item("retro", "gamegear", "Sega Game Gear", 1991, Condition.Good, 90, 0, "Handhelds", ["wanted"], "game_gear.jpg", "Wanted — prefer a recapped unit or a fair-priced project.", [], owned: false),
                ],
            },
            new()
            {
                Id = "pokemon",
                Name = "Pokémon",
                Description = "Cards, games, toys and media — one franchise, many shelves",
                Groups =
                [
                    Group("pokemon", "pk_cards", "Cards", null, ["Set no.", "Language"], 0),
                    Group("pokemon", "pk_cards_reg", "Regular cards", "pk_cards", [], 1),
                    // Two cards listed of a four-card chase: one owned, one on
                    // the wantlist, two not even catalogued — the three ways a
                    // group can be short of its target, all in one node.
                    Group("pokemon", "pk_cards_rare", "Rare & holo", "pk_cards", [Field("Grade")], 2, target: 4),
                    Group("pokemon", "pk_games", "Games", null, ["Completeness"], 3),
                    // Both owned against a target of two: the completed state.
                    Group("pokemon", "pk_games_n64", "N64", "pk_games", [], 4, target: 2),
                    Group("pokemon", "pk_games_gb", "Game Boy", "pk_games", ["Battery"], 5),
                    Group("pokemon", "pk_toys", "Toys", null, [], 6),
                    Group("pokemon", "pk_dvds", "DVDs", null, [], 7),
                ],
                Items =
                [
                    Item("pokemon", "pk_squirtle", "Squirtle (Base Set)", 1999, Condition.Good, 8, 2, "pk_cards_reg", ["raw"], "squirtle_base.jpg", "Base Set Squirtle, lightly played. Binder filler with sentimental value.", extraCopies: [Copy("pk_squirtle_c2", Condition.Mint, 3, CopyStatus.ForTrade, acquiredOn: new DateOnly(2024, 6, 15), notes: "Pulled from a bundle — trade bait."), Copy("pk_squirtle_c3", Condition.Fair, 1, CopyStatus.ForSale, value: 4, acquiredOn: new DateOnly(2022, 3, 8), notes: "Creased corner, playable only.")]),
                    Item("pokemon", "pk_eevee", "Eevee (Jungle)", 1999, Condition.Mint, 6, 1, "pk_cards_reg", ["raw"], "eevee_jungle.jpg", "Pack-fresh Jungle Eevee, sleeved since the day it was pulled.", extraCopies: [Copy("pk_eevee_c2", Condition.Good, 2, CopyStatus.ForTrade, acquiredOn: new DateOnly(2025, 1, 19), notes: "Duplicate from a lot — happy to trade.")]),
                    Item("pokemon", "pk_zard_ex", "Charizard ex (FireRed)", 2004, Condition.Good, 380, 210, "pk_cards_rare", ["holo"], "charizard_ex.jpg", "FireRed & LeafGreen Charizard ex, light edgewear on the back.", Custom(("Set no.", "105/112"))),
                    Item("pokemon", "pk_umbreon", "Umbreon Gold Star", 2005, Condition.Good, 1900, 0, "pk_cards_rare", ["wanted", "grail"], "umbreon_star.jpg", "POP Series 5 grail — hunting a clean raw copy.", [], owned: false),
                    Item("pokemon", "pk_stadium", "Pokémon Stadium (CIB)", 2000, Condition.Good, 120, 70, "pk_games_n64", ["cib"], "pk_stadium.jpg", "Complete in box with Transfer Pak. Box has light shelf wear."),
                    Item("pokemon", "pk_snap", "Pokémon Snap", 1999, Condition.Fair, 60, 30, "pk_games_n64", ["loose"], "pk_snap.jpg", "Loose cart, label faded from sunlight."),
                    Item("pokemon", "pk_yellow", "Pokémon Yellow", 1998, Condition.Good, 110, 55, "pk_games_gb", ["loose"], "pk_yellow.jpg", "Loose cart with a fresh save battery.", Custom(("Battery", "Replaced 2025"))),
                    Item("pokemon", "pk_crystal", "Pokémon Crystal", 2000, Condition.Good, 260, 0, "pk_games_gb", ["wanted"], "pk_crystal.jpg", "Wanted — authentic cart only, working RTC preferred.", [], owned: false),
                    Item("pokemon", "pk_snorlax", "Snorlax plush (1998 original)", 1998, Condition.Good, 90, 40, "pk_toys", ["vintage"], "snorlax_plush.jpg", "Original Play-By-Play plush with tush tag intact."),
                    Item("pokemon", "pk_movie", "Pokémon: The First Movie (DVD)", 1999, Condition.Mint, 25, 10, "pk_dvds", ["sealed"], "pk_movie_dvd.jpg", "Still-sealed first-print DVD."),
                ],
            },
            new()
            {
                Id = "cards",
                Name = "Trading Cards",
                Description = "Graded + raw, mostly 90s TCG",
                Groups = FlatGroups("cards",
                    ("Pokémon", new[] { "Grade", "Cert no." }),
                    ("Magic", new[] { "Set" }),
                    ("Sports", new[] { "Card no." })),
                Members = [Member("cards", "Ana Pereira", "ana@example.com", "AP", MemberRole.Viewer)],
                Items =
                [
                    Item("cards", "charizard", "Charizard Holo (Base Set)", 1999, Condition.Mint, 4200, 3100, "Pokémon", ["graded", "psa8"], "charizard_base.jpg", "Base Set Unlimited Charizard, PSA 8. Strong centering, minor whitening on the back only.", Custom(("Grade", "PSA 8"), ("Cert no.", "82736411"))),
                    Item("cards", "blastoise", "Blastoise Holo (Base Set)", 1999, Condition.Good, 380, 240, "Pokémon", ["raw"], "blastoise_base.jpg", "Raw Base Set Blastoise, light edgewear. Solid candidate for grading.", Custom(("Grade", "Raw (est. 6-7)"))),
                    Item("cards", "shivan", "Shivan Dragon (Revised)", 1994, Condition.Good, 45, 30, "Magic", ["raw"], "shivan_revised.jpg", "Revised edition Shivan Dragon, lightly played. Childhood nostalgia pull.", Custom(("Set", "Revised (3ED)")), extraCopies: [Copy("shivan_c2", Condition.Fair, 18, CopyStatus.ForTrade, value: 25, acquiredOn: new DateOnly(2021, 9, 30), notes: "Playset spare, moderate edge wear.")]),
                    Item("cards", "griffey", "Ken Griffey Jr. RC (Upper Deck)", 1989, Condition.Mint, 120, 60, "Sports", ["rookie"], "griffey_rc.jpg", "The iconic 1989 Upper Deck #1 rookie card. Sharp corners, clean surface.", Custom(("Card no.", "#1"))),
                    Item("cards", "venusaur", "Venusaur Holo (Base Set)", 1999, Condition.Good, 340, 0, "Pokémon", ["wanted"], "venusaur_base.jpg", "The missing starter — would complete the Base Set holo trio.", [], owned: false),
                ],
            },
            new()
            {
                Id = "vinyl",
                Name = "Vinyl",
                Description = "First pressings + soundtracks",
                Groups = FlatGroups("vinyl",
                    ("OSTs", new[] { "Variant", "Obi" }),
                    ("Rock", new[] { "Pressing", "Sleeve" }),
                    ("Jazz", new[] { "Label" })),
                Items =
                [
                    Item("vinyl", "okcomputer", "OK Computer — 1st UK press", 1997, Condition.Good, 260, 180, "Rock", ["first-press"], "ok_computer.jpg", "First UK pressing, double LP. Sleeve VG+, vinyl plays clean with faint surface noise on side D.", Custom(("Pressing", "1st UK, NODATA 02"), ("Sleeve", "VG+"))),
                    Item("vinyl", "akira", "Akira — Symphonic Suite OST", 1988, Condition.Mint, 340, 220, "OSTs", ["import", "rare"], "akira_ost.jpg", "Original Japanese pressing of the Geinoh Yamashirogumi score. Obi strip intact.", Custom(("Obi", "Present"))),
                    Item("vinyl", "kindofblue", "Kind of Blue — mono", 1959, Condition.Fair, 480, 300, "Jazz", ["mono", "rare"], "kind_of_blue.jpg", "Mono six-eye pressing. Sleeve is rough but the record itself grades VG.", Custom(("Label", "Columbia six-eye"))),
                    Item("vinyl", "doomost", "DOOM (2016) OST — red splatter", 2018, Condition.Mint, 95, 80, "OSTs", ["limited"], "doom_ost.jpg", "Limited red splatter variant, still sealed. Mick Gordon at his heaviest.", Custom(("Variant", "Red splatter /3000")), extraCopies: [Copy("doomost_c2", Condition.Good, 35, CopyStatus.ForSale, value: 60, acquiredOn: new DateOnly(2025, 12, 5), notes: "Opened play copy — the sealed one stays.")]),
                ],
            },
            new()
            {
                Id = "lego",
                Name = "LEGO Sets",
                Description = "Sealed + built, space + castle",
                Groups = FlatGroups("lego",
                    ("Space", new[] { "Completeness" }),
                    ("Castle", new[] { "Missing" }),
                    ("Technic", new[] { "Box" })),
                Items =
                [
                    Item("lego", "galaxy", "Galaxy Explorer 497", 1979, Condition.Good, 720, 450, "Space", ["complete"], "galaxy_explorer.jpg", "Complete classic-space Galaxy Explorer with instructions. Two minifig torsos show cracking.", Custom(("Completeness", "100% parts + instructions"))),
                    Item("lego", "castle", "King's Castle 6080", 1984, Condition.Fair, 380, 220, "Castle", ["near-complete"], "kings_castle.jpg", "Near-complete — missing 4 minor parts and one flag. Instructions included, no box.", Custom(("Missing", "4 parts, 1 flag"))),
                    Item("lego", "technic", "Technic Super Car 8880", 1994, Condition.Mint, 950, 610, "Technic", ["boxed", "rare"], "technic_8880.jpg", "The legendary 8880 with box and instructions. All gearbox functions work perfectly.", Custom(("Box", "Present, VG"))),
                    Item("lego", "monorail", "Futuron Monorail 6990", 1987, Condition.Good, 850, 0, "Space", ["wanted", "grail"], "monorail_6990.jpg", "Grail set — want it complete with full track and both stations.", [], owned: false),
                ],
            },
            new()
            {
                Id = "comics",
                Name = "Comics",
                Description = "Silver age + modern keys",
                // Issue numbers are what a run is actually ordered by, so the
                // groups declare it as a number and sort by it — the number
                // needn't be repeated in every item's name.
                Groups =
                [
                    // Targets are what turns "3 items" into "3 of 24": the run
                    // has a known length, and the gap is the point of the
                    // collection. Indie declares none on purpose, so the
                    // no-target fallback is always on screen next to them.
                    Group("comics", "Marvel", "Marvel", null,
                        [Field("Issue", GroupFieldType.Number), Field("Grade"), Field("Key")],
                        0, sortBy: "field:Issue", sortDirection: "asc", target: 24),
                    Group("comics", "DC", "DC", null,
                        [Field("Issue", GroupFieldType.Number), Field("Print")],
                        1, sortBy: "field:Issue", sortDirection: "asc", target: 12),
                    Group("comics", "Indie", "Indie", null,
                        [Field("Issue", GroupFieldType.Number), Field("Print")],
                        2, sortBy: "field:Issue", sortDirection: "asc"),
                ],
                // Marvel's runs are eras, not another level of the shelf: they
                // label its items and stop there. Seeded in chronological
                // order, which is deliberately NOT alphabetical — a group would
                // list them Bronze, Silver and lose the point. The group's own
                // "sort by Issue" still orders the items inside each era.
                Sections =
                [
                    Section("comics", "silver", "Marvel", "Silver Age", 0),
                    Section("comics", "bronze", "Marvel", "Bronze Age", 1),
                ],
                Items =
                [
                    // Deliberately seeded out of order: the group's sort is what
                    // puts them back in sequence.
                    Item("comics", "xmen101", "X-Men #101", 1976, Condition.Good, 850, 520, "Marvel", ["key", "graded"], "xmen_101.jpg", "First appearance of Phoenix. CGC 6.5 with off-white pages.", Custom(("Issue", "101"), ("Grade", "CGC 6.5"), ("Key", "1st Phoenix")), sectionId: "bronze"),
                    Item("comics", "xmen94", "X-Men #94", 1975, Condition.Fair, 1200, 780, "Marvel", ["key"], "xmen_94.jpg", "First issue of the new team in the regular run. Well read, complete and flat.", Custom(("Issue", "94"), ("Grade", "Raw VG"), ("Key", "New team begins")), sectionId: "bronze"),
                    Item("comics", "xmen9", "X-Men #9", 1965, Condition.Fair, 640, 400, "Marvel", [], "xmen_9.jpg", "Early Silver Age crossover with the Avengers. Spine wear, no restoration.", Custom(("Issue", "9"), ("Grade", "Raw GD")), sectionId: "silver"),
                    Item("comics", "watchmen", "Watchmen #1", 1986, Condition.Mint, 240, 120, "DC", ["key"], "watchmen_1.jpg", "First print, raw but immaculate. Stored bagged and boarded since the 90s.", Custom(("Issue", "1"), ("Print", "1st"))),
                    Item("comics", "saga", "Saga #1 (1st print)", 2012, Condition.Mint, 180, 90, "Indie", ["key"], "saga_1.jpg", "First print of the Image hit. Modern key that keeps climbing.", Custom(("Issue", "1"), ("Print", "1st"))),
                ],
            },
            new()
            {
                Id = "coins",
                Name = "Coins & Stamps",
                Description = "World coins and classics, pre-1950",
                Groups = FlatGroups("coins",
                    ("US", new[] { "Mint mark" }),
                    ("Europe", new[] { "Cancel" }),
                    ("Asia", [])),
                Items =
                [
                    Item("coins", "morgan", "Morgan Dollar 1889-CC", 1889, Condition.Good, 1400, 950, "US", ["key-date"], "morgan_1889cc.jpg", "Carson City key date. VG details with honest wear, no cleaning.", Custom(("Mint mark", "CC"))),
                    Item("coins", "indianhead", "Indian Head Penny", 1907, Condition.Fair, 28, 15, "US", [], "indian_head.jpg", "Common date in circulated condition. Filler until a better example turns up."),
                    Item("coins", "pennyblack", "Penny Black (used)", 1840, Condition.Good, 420, 300, "Europe", ["rare"], "penny_black.jpg", "The world's first postage stamp, red Maltese cross cancel. Four margins, small thin on reverse.", Custom(("Cancel", "Red Maltese cross"))),
                ],
            },
        ];

        foreach (var collection in collections)
        {
            collection.TenantId = tenantId;
            collection.LinkShare = true;
            foreach (var group in collection.Groups)
            {
                group.TenantId = tenantId;
            }

            for (var i = 0; i < collection.Items.Count; i++)
            {
                collection.Items[i].TenantId = tenantId;
                collection.Items[i].SortOrder = i;
            }

            foreach (var member in collection.Members)
            {
                member.TenantId = tenantId;
            }
        }

        return collections;
    }

    public static List<StoreListing> StoreListings() =>
    [
        new()
        {
            Id = "store_ps1", Name = "PlayStation Classics", Publisher = "Vault Curators",
            Description = "The essential PS1 library — five discs every collector chases.",
            Groups = ["RPG", "Action", "Racing"],
            Items =
            [
                ListingItem("ff7", "Final Fantasy VII (black label)", 1997, 180, "RPG", "ff7_blacklabel.jpg"),
                ListingItem("mgs", "Metal Gear Solid", 1998, 90, "Action", "mgs_ps1.jpg"),
                ListingItem("sotn", "Castlevania: SotN", 1997, 260, "Action", "sotn_ps1.jpg"),
                ListingItem("gt2", "Gran Turismo 2", 1999, 35, "Racing", "gt2_ps1.jpg"),
                ListingItem("chronocross", "Chrono Cross", 1999, 85, "RPG", "chrono_cross.jpg"),
            ],
        },
        new()
        {
            Id = "store_gb", Name = "Game Boy Essentials", Publisher = "RetroDB",
            Description = "Five carts that defined the brick — the classic starter checklist.",
            Groups = ["Launch era", "Classics"],
            Items =
            [
                ListingItem("tetris", "Tetris", 1989, 25, "Launch era", "tetris_gb.jpg"),
                ListingItem("sml", "Super Mario Land", 1989, 40, "Launch era", "sml_gb.jpg"),
                ListingItem("pkmred", "Pokémon Red", 1996, 90, "Classics", "pokemon_red.jpg"),
                ListingItem("zelda_la", "Link's Awakening", 1993, 70, "Classics", "links_awakening.jpg"),
                ListingItem("kirby", "Kirby's Dream Land", 1992, 45, "Classics", "kirby_gb.jpg"),
            ],
        },
        new()
        {
            Id = "store_beatles", Name = "Beatles Studio Albums", Publisher = "WaxWorks",
            Description = "UK studio pressings — the core five to start a serious shelf.",
            Groups = ["60s"],
            Items =
            [
                ListingItem("rubbersoul", "Rubber Soul", 1965, 110, "60s", "rubber_soul.jpg"),
                ListingItem("revolver", "Revolver", 1966, 150, "60s", "revolver.jpg"),
                ListingItem("sgtpepper", "Sgt. Pepper's Lonely Hearts Club Band", 1967, 140, "60s", "sgt_pepper.jpg"),
                ListingItem("whitealbum", "The White Album", 1968, 180, "60s", "white_album.jpg"),
                ListingItem("abbeyroad", "Abbey Road", 1969, 120, "60s", "abbey_road.jpg"),
            ],
        },
        new()
        {
            Id = "store_bronze", Name = "Bronze Age Marvel Keys", Publisher = "KeyIssues",
            Description = "Four grails from the 70s — first appearances that anchor a comic vault.",
            Groups = ["Marvel"],
            Items =
            [
                ListingItem("hulk181", "Incredible Hulk #181", 1974, 3200, "Marvel", "hulk_181.jpg"),
                ListingItem("asm129", "Amazing Spider-Man #129", 1974, 1100, "Marvel", "asm_129.jpg"),
                ListingItem("gsxm1", "Giant-Size X-Men #1", 1975, 2400, "Marvel", "gsxm_1.jpg"),
                ListingItem("im55", "Iron Man #55", 1973, 480, "Marvel", "ironman_55.jpg"),
            ],
        },
        new()
        {
            Id = "store_space", Name = "Classic Space Fleet", Publisher = "BrickIndex",
            Description = "The grey-and-blue LEGO fleet, 1978–83. Benny would approve.",
            Groups = ["Space"],
            Items =
            [
                ListingItem("cruiser924", "Space Cruiser 924", 1978, 260, "Space", "cruiser_924.jpg"),
                ListingItem("beta6970", "Beta-1 Command Base 6970", 1980, 340, "Space", "beta1_6970.jpg"),
                ListingItem("commander6980", "Galaxy Commander 6980", 1983, 520, "Space", "commander_6980.jpg"),
                ListingItem("voyager6929", "Starfleet Voyager 6929", 1981, 290, "Space", "voyager_6929.jpg"),
            ],
        },
    ];

    // --- helpers ---

    /// <summary>Flat root groups whose fields are all plain text.</summary>
    private static List<Group> FlatGroups(string collectionId, params (string Name, string[] Fields)[] defs) =>
        [.. defs.Select((d, i) => Group(collectionId, d.Name, d.Name, null, [.. d.Fields.Select(f => Field(f))], i))];

    private static GroupField Field(
        string name,
        GroupFieldType type = GroupFieldType.Text,
        FieldScope scope = FieldScope.Item) =>
        new() { Name = name, Type = type, Scope = scope };

    private static Group Group(
        string collectionId,
        string id,
        string name,
        string? parentId,
        // No `target` here on purpose: an optional parameter in both overloads
        // makes an empty `[]` field list ambiguous between them. Groups that
        // declare a target pass an explicit GroupField list instead.
        List<string> fields,
        int sortOrder) =>
        Group(collectionId, id, name, parentId, [.. fields.Select(f => Field(f))], sortOrder);

    private static Group Group(
        string collectionId,
        string id,
        string name,
        string? parentId,
        List<GroupField> fields,
        int sortOrder,
        string? sortBy = null,
        string? sortDirection = null,
        int? target = null) => new()
        {
            CollectionId = collectionId,
            Id = id,
            Name = name,
            ParentId = parentId,
            Fields = fields,
            SortBy = sortBy,
            SortDirection = sortDirection,
            Target = target,
            SortOrder = sortOrder,
        };

    private static Section Section(
        string collectionId,
        string id,
        string groupId,
        string name,
        int sortOrder,
        int? target = null) => new()
        {
            CollectionId = collectionId,
            Id = id,
            GroupId = groupId,
            Name = name,
            Target = target,
            SortOrder = sortOrder,
        };

    private static CollectionMember Member(string collectionId, string name, string email, string initials, MemberRole role) => new()
    {
        CollectionId = collectionId,
        Email = email,
        Name = name,
        Initials = initials,
        Role = role,
    };

    /// <summary>
    /// Demo item. <paramref name="condition"/> and <paramref name="price"/>
    /// describe the first copy; <paramref name="owned"/> false means no copies
    /// at all (wantlist). Extra copies are appended after the first.
    /// </summary>
    private static Item Item(
        string collectionId,
        string id,
        string name,
        int year,
        Condition condition,
        decimal value,
        decimal price,
        string groupId,
        List<string> tags,
        string img,
        string description,
        List<CustomFieldValue>? custom = null,
        bool owned = true,
        List<ItemCopy>? extraCopies = null,
        string sectionId = "") => new()
        {
            CollectionId = collectionId,
            Id = id,
            Name = name,
            Year = year,
            Value = value,
            GroupId = groupId,
            SectionId = sectionId,
            Tags = tags,
            Img = img,
            Description = description,
            Custom = custom ?? [],
            // The `{id}_c1` scheme matches the AddItemCopies backfill, so a
            // migrated database and a freshly seeded one look identical.
            Copies = owned
                ? [Copy($"{id}_c1", condition, price), .. extraCopies ?? []]
                : [],
        };

    private static ItemCopy Copy(
        string id,
        Condition condition,
        decimal price,
        CopyStatus status = CopyStatus.Keep,
        decimal? value = null,
        DateOnly? acquiredOn = null,
        string notes = "",
        List<CustomFieldValue>? custom = null) => new()
        {
            Id = id,
            Condition = condition,
            Price = price,
            Status = status,
            Value = value,
            AcquiredOn = acquiredOn,
            Notes = notes,
            Custom = custom ?? [],
        };

    private static List<CustomFieldValue> Custom(params (string Key, string Value)[] pairs) =>
        [.. pairs.Select(p => new CustomFieldValue { Key = p.Key, Value = p.Value })];

    private static StoreListingItem ListingItem(string id, string name, int year, decimal value, string group, string img) => new()
    {
        Id = id,
        Name = name,
        Year = year,
        Value = value,
        Group = group,
        Img = img,
    };
}
