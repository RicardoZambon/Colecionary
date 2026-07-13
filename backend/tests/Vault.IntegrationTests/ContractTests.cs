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
        var login = await VaultApiFactory.LoginAsync(client, "marcus@airia.com", VaultApiFactory.DemoPassword);
        Assert.NotEmpty(login.Token);
        Assert.Equal("Marcus Keller", login.Profile.Name);
        Assert.Equal("free", login.Profile.Plan);

        var bad = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("marcus@airia.com", "wrong"));
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
        var client = await factory.CreateAuthenticatedClientAsync("marcus@airia.com");
        var raw = await client.GetStringAsync("/api/collections");

        Assert.Contains("\"linkShare\":", raw);
        Assert.Contains("\"groupId\":", raw);
        Assert.Contains("\"condition\":\"Mint\"", raw);
        Assert.Contains("\"owned\":false", raw);
        Assert.Contains("\"parentId\":\"pk_cards\"", raw);
        Assert.DoesNotContain("\"TenantId\"", raw);
    }

    [Fact]
    public async Task Collection_FullDocumentPut_ReplacesGraph()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@airia.com");

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
                new GroupNodeDto("g1", "Shonen", null, ["Volumes"]),
                new GroupNodeDto("g2", "Jump", "g1", []),
            ],
            Items =
            [
                new ItemDto("i1", "One Piece Vol. 1", "1st print", 1997, "Good", 45, 12, "g2", ["first-press"], "op1.jpg", [new CustomFieldValueDto("Volumes", "1")], true),
            ],
            Members = [new MemberDto("Ana Pereira", "ana@airia.com", "AP", "Editor")],
            LinkShare = false,
        };

        var putResponse = await client.PutAsJsonAsync($"/api/collections/{created.Id}", updated);
        putResponse.EnsureSuccessStatusCode();

        var all = await client.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        var fetched = all!.Single(c => c.Id == created.Id);
        Assert.Equal("Manga (renamed)", fetched.Name);
        Assert.Equal(["g1", "g2"], fetched.Groups.Select(g => g.Id));
        Assert.Equal("g1", fetched.Groups[1].ParentId);
        Assert.False(fetched.LinkShare);
        Assert.Single(fetched.Members);
        Assert.Equal("One Piece Vol. 1", Assert.Single(fetched.Items).Name);

        // Second PUT dropping the item — wholesale replace must remove it.
        var emptied = updated with { Items = [] };
        (await client.PutAsJsonAsync($"/api/collections/{created.Id}", emptied)).EnsureSuccessStatusCode();
        all = await client.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        Assert.Empty(all!.Single(c => c.Id == created.Id).Items);

        (await client.DeleteAsync($"/api/collections/{created.Id}")).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Items_UpsertByClientId_AndIdempotentDelete()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@airia.com");
        var item = new ItemDto("i1752300000000", "Panzer Dragoon Saga", "Grail hunt", 1998, "Good", 900, 0, "Sega", ["wanted"], "pds.jpg", [], false);

        var createResponse = await client.PutAsJsonAsync($"/api/collections/retro/items/{item.Id}", item);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var updateResponse = await client.PutAsJsonAsync(
            $"/api/collections/retro/items/{item.Id}",
            item with { Owned = true, Price = 650, Tags = [] });
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);

        var collections = await client.GetFromJsonAsync<List<CollectionDto>>("/api/collections");
        var fetched = collections!.Single(c => c.Id == "retro").Items.Single(i => i.Id == item.Id);
        Assert.True(fetched.Owned);
        Assert.Equal(650, fetched.Price);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/collections/retro/items/{item.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/collections/retro/items/{item.Id}")).StatusCode);
    }

    [Fact]
    public async Task StoreListings_AreAGlobalCatalog()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@airia.com");
        var listings = await client.GetFromJsonAsync<List<StoreListingDto>>("/api/store/listings");
        Assert.Equal(5, listings!.Count);
        Assert.Contains(listings, l => l.Id == "store_ps1" && l.Items.Count == 5);
    }

    [Fact]
    public async Task TenantMembers_OwnerOnlyUpdate_WithLastOwnerRule()
    {
        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@airia.com");
        var members = await marcus.GetFromJsonAsync<List<MemberDto>>("/api/tenant/members");
        Assert.Contains(members!, m => m.Email == "ana@airia.com");

        // Editors are forbidden from tenant member management.
        var ana = await factory.CreateAuthenticatedClientAsync("ana@airia.com");
        var forbidden = await ana.PutAsJsonAsync("/api/tenant/members", members);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        // Removing every Owner is refused.
        var ownerless = members!.Where(m => m.Role != "Owner").ToList();
        var badRequest = await marcus.PutAsJsonAsync("/api/tenant/members", ownerless);
        Assert.Equal(HttpStatusCode.BadRequest, badRequest.StatusCode);

        // Inviting a new member (no password yet) works and round-trips.
        var invited = new MemberDto("Joana Silva", "joana.silva@airia.com", "JS", "Viewer");
        var ok = await marcus.PutAsJsonAsync("/api/tenant/members", members!.Append(invited).ToList());
        ok.EnsureSuccessStatusCode();
        var refreshed = await ok.Content.ReadFromJsonAsync<List<MemberDto>>();
        Assert.Contains(refreshed!, m => m.Email == "joana.silva@airia.com" && m.Role == "Viewer");
    }

    [Fact]
    public async Task Profile_UpdatesPlan_AndRefusesEmailChange()
    {
        var client = await factory.CreateAuthenticatedClientAsync("dev@airia.com");
        var profile = await client.GetFromJsonAsync<UserProfileDto>("/api/profile");
        Assert.Equal("free", profile!.Plan);

        var upgraded = await client.PutAsJsonAsync("/api/profile", profile with { Plan = "pro" });
        upgraded.EnsureSuccessStatusCode();
        Assert.Equal("pro", (await upgraded.Content.ReadFromJsonAsync<UserProfileDto>())!.Plan);

        var emailChange = await client.PutAsJsonAsync("/api/profile", profile with { Email = "other@airia.com" });
        Assert.Equal(HttpStatusCode.BadRequest, emailChange.StatusCode);
    }
}
