using System.Net;
using System.Net.Http.Json;
using Vault.Application.Auth;
using Vault.Application.Collections.Dtos;
using Vault.Application.Profile;
using Vault.Application.Store;

namespace Vault.IntegrationTests;

/// <summary>
/// Verifies the API honors the frontend's VaultApi contract: routes, status
/// codes, JSON shape (camelCase + string enums) and behaviors ported from the
/// mock (client-generated ids, full-document PUT, idempotent delete).
/// </summary>
[Collection(nameof(ApiCollection))]
public class ContractTests(VaultApiFactory factory)
{
    [Fact]
    public async Task Login_IssuesTokenWithProfile_And401OnBadPassword()
    {
        var client = factory.CreateClient();
        var login = await VaultApiFactory.LoginAsync(client, "marcus@example.com", VaultApiFactory.DemoPassword);
        Assert.NotEmpty(login.Token);
        Assert.Equal("Marcus Keller", login.Profile.Name);
        Assert.Equal("free", login.Profile.Plan);

        var bad = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("marcus@example.com", "wrong"));
        Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
    }

    [Fact]
    public async Task Endpoints_RequireAuthentication()
    {
        var anonymous = factory.CreateClient();
        var response = await anonymous.GetAsync("/api/collections");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Json_IsCamelCaseWithStringEnums()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var raw = await client.GetStringAsync("/api/collections");

        Assert.Contains("\"linkShare\":", raw);
        Assert.Contains("\"groupId\":", raw);
        Assert.Contains("\"copies\":[", raw);
        // Condition and status live on the copy now, still as strings.
        Assert.Contains("\"condition\":\"Mint\"", raw);
        Assert.Contains("\"status\":\"ForTrade\"", raw);
        // Pins DateOnly's wire format end to end (SQL Server → EF → STJ).
        Assert.Contains("\"acquiredOn\":\"2024-06-15\"", raw);
        // Ownership is derived from the copies, never transported.
        Assert.DoesNotContain("\"owned\":", raw);
        Assert.Contains("\"parentId\":\"pk_cards\"", raw);
        // Group fields are typed objects and the group's sort round-trips.
        Assert.Contains("\"fields\":[{\"name\":\"Issue\",\"type\":\"number\"}", raw);
        Assert.Contains("\"sort\":{\"by\":\"field:Issue\",\"direction\":\"asc\"}", raw);
        // A declared series size travels as a number; an undeclared one travels
        // as an explicit null rather than being omitted, so the client can tell
        // "no target" from "field missing" and round-trip it unchanged.
        Assert.Contains("\"target\":24", raw);
        Assert.Contains("\"target\":null", raw);
        Assert.DoesNotContain("\"TenantId\"", raw);
    }

    [Fact]
    public async Task Collection_FullDocumentPut_ReplacesGraph()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");

        var createResponse = await client.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest("Manga", "Tankōbon shelf"));
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var created = (await createResponse.Content.ReadFromJsonAsync<CollectionDto>())!;

        // Client-generated group + item ids, exactly like the Angular app.
        var updated = created with
        {
            Name = "Manga (renamed)",
            Groups =
            [
                new GroupNodeDto(
                    "g1",
                    "Shonen",
                    null,
                    [new GroupFieldDto("Volumes", "number")],
                    new GroupSortDto("field:Volumes", "asc"),
                    Target: 120),
                new GroupNodeDto("g2", "Jump", "g1", []),
            ],
            Items =
            [
                new ItemDto("i1", "One Piece Vol. 1", "1st print", 1997, 45, "g2", ["first-press"], "op1.jpg",
                    [new CustomFieldValueDto("Volumes", "1")],
                    Copies:
                    [
                        new ItemCopyDto("i1_c1", "Good", 12, null, new DateOnly(2019, 5, 4), "Keep", "reading copy"),
                        new ItemCopyDto("i1_c2", "Mint", 30, 55m, null, "ForSale", ""),
                    ]),
            ],
            Members = [new MemberDto("Ana Pereira", "ana@example.com", "AP", "Editor")],
            LinkShare = false,
        };

        var putResponse = await client.PutCollectionAsync(updated);
        putResponse.EnsureSuccessStatusCode();

        var all = await client.GetCollectionsAsync();
        var fetched = all!.Single(c => c.Id == created.Id);
        Assert.Equal("Manga (renamed)", fetched.Name);
        Assert.Equal(["g1", "g2"], fetched.Groups.Select(g => g.Id));
        Assert.Equal("g1", fetched.Groups[1].ParentId);
        Assert.Equal("number", Assert.Single(fetched.Groups[0].Fields).Type);
        Assert.Equal(new GroupSortDto("field:Volumes", "asc"), fetched.Groups[0].Sort);
        Assert.Null(fetched.Groups[1].Sort);
        Assert.Equal(120, fetched.Groups[0].Target);
        Assert.Null(fetched.Groups[1].Target);   // undeclared stays undeclared
        Assert.False(fetched.LinkShare);
        Assert.Single(fetched.Members);
        Assert.Equal("One Piece Vol. 1", Assert.Single(fetched.Items).Name);

        var savedItem = Assert.Single(fetched.Items);
        Assert.Equal(["i1_c1", "i1_c2"], savedItem.Copies.Select(c => c.Id));
        Assert.Equal("ForSale", savedItem.Copies[1].Status);
        Assert.Equal(new DateOnly(2019, 5, 4), savedItem.Copies[0].AcquiredOn);
        Assert.Null(savedItem.Copies[0].Value);       // falls back to the item's Value
        Assert.Equal(55m, savedItem.Copies[1].Value); // per-copy override survives
        Assert.Equal("reading copy", savedItem.Copies[0].Notes);

        // A second PUT of the SAME collection: i1 already exists, so this goes
        // through ReplaceGraph's per-field update lambda rather than its
        // add-newcomer branch. Without it, a dropped `current.Copies` assignment
        // would never be exercised.
        var edited = updated with
        {
            // g1 already exists too, so its sort goes through the same update
            // lambda — a dropped SortBy/SortDirection assignment saves on
            // create and then silently never changes again.
            Groups =
            [
                updated.Groups[0] with
                {
                    Fields = [new GroupFieldDto("Volumes", "text")],
                    Sort = new GroupSortDto("name", "desc"),
                    Target = 121,
                },
                updated.Groups[1],
            ],
            Items =
            [
                updated.Items[0] with
                {
                    Copies = [new ItemCopyDto("i1_c2", "Good", 30, null, new DateOnly(2020, 1, 2), "ForTrade", "regraded")],
                },
            ],
        };
        (await client.PutCollectionAsync(edited)).EnsureSuccessStatusCode();
        all = await client.GetCollectionsAsync();
        var reFetchedGroup = all!.Single(c => c.Id == created.Id).Groups[0];
        Assert.Equal(new GroupSortDto("name", "desc"), reFetchedGroup.Sort);
        Assert.Equal("text", Assert.Single(reFetchedGroup.Fields).Type);
        // Fails if ReplaceGraph's group update lambda omits `current.Target`:
        // the target would save on create and then never change again.
        Assert.Equal(121, reFetchedGroup.Target);

        var reFetched = all!.Single(c => c.Id == created.Id).Items.Single();
        var only = Assert.Single(reFetched.Copies);   // i1_c1 removed
        Assert.Equal("i1_c2", only.Id);
        Assert.Equal("ForTrade", only.Status);        // status edit persisted
        Assert.Equal("Good", only.Condition);         // condition edit persisted
        Assert.Null(only.Value);                      // override cleared back to null
        Assert.Equal(new DateOnly(2020, 1, 2), only.AcquiredOn);

        // Third PUT dropping the item — wholesale replace must remove it. It
        // also clears g1's sort and target back to null, which only works if
        // the update lambda overwrites rather than coalesces.
        var emptied = updated with
        {
            Groups = [updated.Groups[0] with { Sort = null, Target = null }, updated.Groups[1]],
            Items = [],
        };
        (await client.PutCollectionAsync(emptied)).EnsureSuccessStatusCode();
        all = await client.GetCollectionsAsync();
        Assert.Empty(all!.Single(c => c.Id == created.Id).Items);
        Assert.Null(all!.Single(c => c.Id == created.Id).Groups[0].Sort);
        Assert.Null(all!.Single(c => c.Id == created.Id).Groups[0].Target);

        (await client.DeleteAsync($"/api/collections/{created.Id}")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Items_UpsertByClientId_AndIdempotentDelete()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        // No copies at all — a wantlist item.
        var item = new ItemDto("i1752300000000", "Panzer Dragoon Saga", "Grail hunt", 1998, 900, "Sega", ["wanted"], "pds.jpg", []);

        var createResponse = await client.PutItemAsync("retro", item);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        Assert.Empty((await createResponse.Content.ReadFromJsonAsync<ItemDto>())!.Copies);

        // Found two of them — the wantlist item becomes owned. This is the
        // ApplyTo path: a missed field here saves with 200 and loses the edit.
        var owned = item with
        {
            Tags = [],
            Copies =
            [
                new ItemCopyDto("pds_c1", "Good", 650, null, new DateOnly(2026, 2, 14), "Keep", "finally"),
                new ItemCopyDto("pds_c2", "Fair", 400, 700m, null, "ForSale", ""),
            ],
        };
        var updateResponse = await client.PutItemAsync("retro", owned);
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);

        var collections = await client.GetCollectionsAsync();
        var fetched = collections!.Single(c => c.Id == "retro").Items.Single(i => i.Id == item.Id);
        Assert.Equal(["pds_c1", "pds_c2"], fetched.Copies.Select(c => c.Id));
        Assert.Equal(650, fetched.Copies[0].Price);
        Assert.Equal(700m, fetched.Copies[1].Value);
        Assert.Equal(new DateOnly(2026, 2, 14), fetched.Copies[0].AcquiredOn);
        Assert.Equal("ForSale", fetched.Copies[1].Status);

        // Sold one — shrink back to a single copy, still through ApplyTo.
        var sold = owned with { Copies = [owned.Copies[0] with { Notes = "kept the good one" }] };
        (await client.PutItemAsync("retro", sold)).EnsureSuccessStatusCode();
        collections = await client.GetCollectionsAsync();
        fetched = collections!.Single(c => c.Id == "retro").Items.Single(i => i.Id == item.Id);
        Assert.Equal("kept the good one", Assert.Single(fetched.Copies).Notes);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/collections/retro/items/{item.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/collections/retro/items/{item.Id}")).StatusCode);
    }

    [Fact]
    public async Task SeededDemo_ExposesMultiCopyItems()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var collections = await client.GetCollectionsAsync();

        var squirtle = collections!.Single(c => c.Id == "pokemon").Items.Single(i => i.Id == "pk_squirtle");
        Assert.Equal(3, squirtle.Copies.Count);
        Assert.Equal(["Keep", "ForTrade", "ForSale"], squirtle.Copies.Select(c => c.Status));
        Assert.Null(squirtle.Copies[0].Value);  // inherits the item's reference value
        Assert.Equal(4m, squirtle.Copies[2].Value);

        // A single-copy item and a wantlist item, for contrast.
        Assert.Single(collections!.Single(c => c.Id == "retro").Items.Single(i => i.Id == "nes").Copies);
        Assert.Empty(collections!.Single(c => c.Id == "retro").Items.Single(i => i.Id == "saturn").Copies);
    }

    [Fact]
    public async Task Import_CreatesWantlistItemsWithNoCopies()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");

        var imported = await client.PostAsync("/api/collections/import/store_ps1", null);
        Assert.Equal(HttpStatusCode.Created, imported.StatusCode);
        var dto = (await imported.Content.ReadFromJsonAsync<CollectionDto>())!;

        Assert.NotEmpty(dto.Items);
        Assert.All(dto.Items, i => Assert.Empty(i.Copies));
        Assert.All(dto.Items, i => Assert.Contains("wanted", i.Tags));

        // The fixture shares one seeded tenant across tests — clean up.
        (await client.DeleteAsync($"/api/collections/{dto.Id}")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task StoreListings_AreAGlobalCatalog()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var listings = await client.GetFromJsonAsync<List<StoreListingDto>>("/api/store/listings");
        Assert.Equal(5, listings!.Count);
        Assert.Contains(listings, l => l.Id == "store_ps1" && l.Items.Count == 5);
    }

    [Fact]
    public async Task TenantMembers_OwnerOnlyUpdate_WithLastOwnerRule()
    {
        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var members = await marcus.GetFromJsonAsync<List<MemberDto>>("/api/tenant/members");
        Assert.Contains(members!, m => m.Email == "ana@example.com");

        // Editors are forbidden from tenant member management.
        var ana = await factory.CreateAuthenticatedClientAsync("ana@example.com");
        var forbidden = await ana.PutAsJsonAsync("/api/tenant/members", members);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        // Removing every Owner is refused.
        var ownerless = members!.Where(m => m.Role != "Owner").ToList();
        var badRequest = await marcus.PutAsJsonAsync("/api/tenant/members", ownerless);
        Assert.Equal(HttpStatusCode.BadRequest, badRequest.StatusCode);

        // Inviting a new member (no password yet) works and round-trips.
        var invited = new MemberDto("Joana Silva", "joana.silva@example.com", "JS", "Viewer");
        var ok = await marcus.PutAsJsonAsync("/api/tenant/members", members!.Append(invited).ToList());
        ok.EnsureSuccessStatusCode();
        var refreshed = await ok.Content.ReadFromJsonAsync<List<MemberDto>>();
        Assert.Contains(refreshed!, m => m.Email == "joana.silva@example.com" && m.Role == "Viewer");
    }

    [Fact]
    public async Task Profile_UpdatesPlan_AndRefusesEmailChange()
    {
        var client = await factory.CreateAuthenticatedClientAsync("dev@example.com");
        var profile = await client.GetFromJsonAsync<UserProfileDto>("/api/profile");
        Assert.Equal("free", profile!.Plan);

        var upgraded = await client.PutAsJsonAsync("/api/profile", profile with { Plan = "pro" });
        upgraded.EnsureSuccessStatusCode();
        Assert.Equal("pro", (await upgraded.Content.ReadFromJsonAsync<UserProfileDto>())!.Plan);

        var emailChange = await client.PutAsJsonAsync("/api/profile", profile with { Email = "other@example.com" });
        Assert.Equal(HttpStatusCode.BadRequest, emailChange.StatusCode);
    }
}
