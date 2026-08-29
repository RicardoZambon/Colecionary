using System.Net;
using System.Net.Http.Json;
using Vault.Application.Collections.Dtos;
using Vault.Application.Tenants;

namespace Vault.IntegrationTests;

/// <summary>
/// Pins that a role actually restricts something.
/// </summary>
/// <remarks>
/// <para>
/// This file exists because it did not. Authentication was deny-by-default from
/// the start, so every one of these endpoints correctly refused an anonymous
/// caller — and every one of them then accepted a <b>Viewer</b>. The role was
/// minted into the JWT, exposed on <c>ICurrentTenant.Role</c>, rendered in the
/// members table, and consulted by nothing: the seeded read-only account could
/// replace any collection document and delete any item in the tenant.
/// </para>
/// <para>
/// The seeded cast is the whole point of testing it here rather than in a unit
/// test: <c>marcus@</c> is the Owner, <c>ana@</c> an Editor and <c>dev@</c> a
/// Viewer, all in the same tenant, so "refused" has to mean refused by role and
/// not by tenancy — which the global query filter would produce for a different
/// tenant and which would look identical from the outside.
/// </para>
/// </remarks>
[Collection(nameof(ApiCollection))]
public class RoleAuthorizationTests(VaultApiFactory factory)
{
    private const string Owner = "marcus@example.com";
    private const string Editor = "ana@example.com";
    private const string Viewer = "dev@example.com";

    /// <summary>
    /// Every catalogue write, refused for a Viewer with a 403.
    /// </summary>
    /// <remarks>
    /// 403 and not 404: the collection plainly exists and the Viewer can read
    /// it, so hiding it would be a lie the client cannot act on. The distinction
    /// matters to the frontend, which now surfaces "no permission" as its own
    /// sentence.
    /// </remarks>
    [Fact]
    public async Task AViewer_CannotWriteAnything()
    {
        var owner = await factory.CreateAuthenticatedClientAsync(Owner);
        var viewer = await factory.CreateAuthenticatedClientAsync(Viewer);

        // A Viewer can still read — this is authorization, not tenancy.
        var readable = await viewer.GetAsync("/api/collections");
        readable.EnsureSuccessStatusCode();

        var collections = await owner.GetFromJsonAsync<List<VersionedCollectionDto>>("/api/collections");
        var target = collections!.First();

        var create = await viewer.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest("Viewer should not manage this", string.Empty));
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);

        // The precondition is correct and current, so a 403 here can only be
        // the role: a stale token would have earned a 412 instead.
        using (var update = new HttpRequestMessage(HttpMethod.Put, $"/api/collections/{target.Collection.Id}"))
        {
            update.Content = JsonContent.Create(target.Collection with { Name = "Renamed by a Viewer" });
            update.Headers.TryAddWithoutValidation("If-Match", target.Version);
            var response = await viewer.SendAsync(update);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }

        var delete = await viewer.DeleteAsync($"/api/collections/{target.Collection.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);

        var item = target.Collection.Items.FirstOrDefault();
        if (item is not null)
        {
            using var upsert = new HttpRequestMessage(
                HttpMethod.Put,
                $"/api/collections/{target.Collection.Id}/items/{item.Id}");
            upsert.Content = JsonContent.Create(item with { Name = "Renamed by a Viewer" });
            upsert.Headers.TryAddWithoutValidation("If-Match", target.Version);
            var response = await viewer.SendAsync(upsert);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

            var itemDelete = await viewer.DeleteAsync(
                $"/api/collections/{target.Collection.Id}/items/{item.Id}");
            Assert.Equal(HttpStatusCode.Forbidden, itemDelete.StatusCode);
        }

        // And nothing was written by any of it.
        var after = await owner.GetFromJsonAsync<List<VersionedCollectionDto>>("/api/collections");
        var reread = after!.Single(c => c.Collection.Id == target.Collection.Id);
        Assert.Equal(target.Collection.Name, reread.Collection.Name);
        Assert.Equal(target.Version, reread.Version);
    }

    /// <summary>An Editor is not a Viewer: the same writes go through.</summary>
    /// <remarks>
    /// The half that a role check is most likely to get wrong. A policy that
    /// refuses everybody passes the test above and breaks the product.
    /// </remarks>
    [Fact]
    public async Task AnEditor_CanWriteCatalogueContent()
    {
        var editor = await factory.CreateAuthenticatedClientAsync(Editor);

        var create = await editor.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest($"Editor collection {Guid.NewGuid():N}", string.Empty));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);

        var created = await create.Content.ReadFromJsonAsync<CollectionDto>();
        var version = create.Headers.ETag!.ToString();

        try
        {
            using var update = new HttpRequestMessage(HttpMethod.Put, $"/api/collections/{created!.Id}");
            update.Content = JsonContent.Create(created with { Description = "Edited by an Editor" });
            update.Headers.TryAddWithoutValidation("If-Match", version);
            var response = await editor.SendAsync(update);
            response.EnsureSuccessStatusCode();
        }
        finally
        {
            await editor.DeleteAsync($"/api/collections/{created!.Id}");
        }
    }

    /// <summary>
    /// Account-scale acts are Owner-only, and an Editor is refused them.
    /// </summary>
    /// <remarks>
    /// Archive import sits here rather than with the catalogue writes because it
    /// is not an edit: one request can overwrite every collection in the vault,
    /// which is an account-scale act arriving through a content-shaped endpoint.
    /// </remarks>
    [Fact]
    public async Task OnlyAnOwner_CanAdministerTheAccount()
    {
        var editor = await factory.CreateAuthenticatedClientAsync(Editor);
        var viewer = await factory.CreateAuthenticatedClientAsync(Viewer);

        foreach (var client in new[] { editor, viewer })
        {
            var settings = await client.PutAsJsonAsync(
                "/api/tenant/settings",
                new TenantSettingsDto("BRL"));
            Assert.Equal(HttpStatusCode.Forbidden, settings.StatusCode);

            var members = await client.PutAsJsonAsync("/api/tenant/members", new List<MemberDto>());
            Assert.Equal(HttpStatusCode.Forbidden, members.StatusCode);

            using var import = new MultipartFormDataContent();
            import.Add(new ByteArrayContent([0x50, 0x4B, 0x03, 0x04]), "file", "vault.zip");
            var restore = await client.PostAsync("/api/import", import);
            Assert.Equal(HttpStatusCode.Forbidden, restore.StatusCode);
        }
    }
}
