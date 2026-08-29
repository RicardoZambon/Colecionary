using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Application.Collections.Dtos;
using Vault.Application.Common;
using Vault.Application.Resources;
using Vault.Domain.Enums;
using Vault.Domain.ValueObjects;
using Vault.Infrastructure.Persistence;
using Vault.Infrastructure.Persistence.Interceptors;
using Vault.Infrastructure.Persistence.Repositories;

namespace Vault.IntegrationTests;

/// <summary>
/// The collection PUT replaces a whole document, so a client working from a
/// version somebody has already replaced does not overwrite part of their work —
/// it restores an old document over all of it. These tests pin the guard that
/// stops that, end to end through the real HTTP endpoints.
/// </summary>
/// <remarks>
/// Every test creates and deletes its own collection. The demo collections are
/// shared with every other class in <see cref="ApiCollection"/>, and a test that
/// deliberately loses a race has no business leaving one of them at an
/// unexpected version.
/// </remarks>
[Collection(nameof(ApiCollection))]
public class OptimisticConcurrencyTests(VaultApiFactory factory)
{
    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    // --- the one that matters ---

    [Fact]
    public async Task TwoWritersAtTheSameVersion_OnlyOneWins_AndTheLoserIsTold()
    {
        var one = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var two = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(one, "Race");

        try
        {
            // Both read the same version — the situation two open tabs are in.
            var version = await one.GetCollectionVersionAsync(created.Id);
            Assert.Equal(version, await two.GetCollectionVersionAsync(created.Id));

            // Sent concurrently, not one after the other: the sequential case is
            // caught by comparing versions before writing, and would prove
            // nothing about the case where both readers pass that comparison.
            var responses = await Task.WhenAll(
                one.PutCollectionAsync(created with { Name = "Written by one" }, version),
                two.PutCollectionAsync(created with { Name = "Written by two" }, version));

            var winners = responses.Where(r => r.IsSuccessStatusCode).ToArray();
            var losers = responses.Where(r => !r.IsSuccessStatusCode).ToArray();
            Assert.Single(winners);
            Assert.Equal(HttpStatusCode.PreconditionFailed, Assert.Single(losers).StatusCode);

            // Not merely "one failed": the survivor is a whole document written
            // by one of them, and the loser's name is nowhere in storage.
            var winner = (await winners[0].Content.ReadFromJsonAsync<CollectionDto>())!;
            var stored = await StoredAsync(created.Id);
            Assert.Equal(winner.Name, stored.Name);
            Assert.Contains(stored.Name, new[] { "Written by one", "Written by two" });

            // And the loser is told in words, not only in a status code.
            var problem = await losers[0].Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal(
                Messages.In(nameof(Messages.CollectionChangedElsewhere), CultureInfo.GetCultureInfo("en")),
                problem.GetProperty("detail").GetString());
        }
        finally
        {
            await DeleteAsync(one, created.Id);
        }
    }

    [Fact]
    public async Task WhenBothWritersPassTheirPrecondition_TheDatabaseStillLetsOnlyOneThrough()
    {
        // The interesting interleaving, built by hand because it cannot be
        // provoked reliably over HTTP: both writers read the same version, both
        // find their precondition satisfied, and only then does either write.
        // Comparing versions in the service cannot catch this — by the time the
        // second one saves, its comparison has already happened and passed. The
        // concurrency token on the row is the only thing left, and this is the
        // test that says so. It fails outright with `IsConcurrencyToken()`
        // removed, which the HTTP-level race test does not.
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Both pass");

        try
        {
            (await client.PutCollectionAsync(created with { Items = [Item("i1", "Original")] }))
                .EnsureSuccessStatusCode();

            var tenantId = await factory.QueryDbAsync(db => db.Collections
                .IgnoreQueryFilters()
                .Where(c => c.Id == created.Id)
                .Select(c => c.TenantId)
                .FirstAsync());

            await using var one = NewContext(tenantId);
            await using var two = NewContext(tenantId);
            var first = (await new CollectionRepository(one).GetAsync(created.Id, default))!;
            var second = (await new CollectionRepository(two).GetAsync(created.Id, default))!;
            Assert.Equal(first.Version, second.Version);

            // Neither touches a column on the collection row: both edit an item.
            // The version has to follow anyway, which is the interceptor's job.
            first.Items[0].Name = "Written by one";
            await one.SaveChangesAsync();

            second.Items[0].Name = "Written by two";
            await Assert.ThrowsAsync<PreconditionFailedException>(() => two.SaveChangesAsync());

            // And the loser's item UPDATE — which on its own would have affected
            // one row quite happily — went back with the guarded root UPDATE.
            Assert.Equal("Written by one", Assert.Single((await StoredAsync(created.Id)).Items).Name);
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task ARejectedPut_LeavesTheStoredDocumentByteIdentical()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Untouched by a refusal");

        try
        {
            var stale = await client.GetCollectionVersionAsync(created.Id);

            // Somebody else moves it on, with a document that has real children:
            // a rejected replace must not manage to delete any of them.
            var winner = created with
            {
                Name = "Winner",
                Groups = [new GroupNodeDto("g1", "Kept", null, [])],
                Items = [Item("i1", "Kept item")],
            };
            (await client.PutCollectionAsync(winner)).EnsureSuccessStatusCode();
            var before = await SnapshotAsync(created.Id);

            var refused = await client.PutCollectionAsync(
                created with { Name = "Loser", Groups = [], Items = [] },
                stale);
            Assert.Equal(HttpStatusCode.PreconditionFailed, refused.StatusCode);

            // Byte-for-byte, groups and items included. A guard that refused the
            // request but had already deleted the children would pass a status
            // assertion and fail this one.
            Assert.Equal(before, await SnapshotAsync(created.Id));
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task ARejectedPut_DoesNotClearAnImagesCollectionMark()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Marks survive a refusal");
        var photo = await UploadAsync(client);

        try
        {
            var stale = await client.GetCollectionVersionAsync(created.Id);
            (await client.PutCollectionAsync(created with { Name = "Moved on" })).EnsureSuccessStatusCode();

            // The garbage collector believes nothing points at this photo, and
            // its grace period is running.
            var marked = DateTimeOffset.UtcNow.AddDays(-3);
            await SetMarkAsync(photo, marked);

            // A refused PUT that *would* have referenced the photo must not touch
            // the mark. Clearing it for a write that never happened restarts the
            // collector's clock on an image nothing points at, hiding it for
            // another whole grace period — the release therefore has to sit
            // downstream of the version check, and this is what says so.
            var refused = await client.PutCollectionAsync(
                created with { Items = [Item("i1", "Has the photo", photo)] },
                stale);
            Assert.Equal(HttpStatusCode.PreconditionFailed, refused.StatusCode);
            Assert.Equal(marked, await MarkAsync(photo));

            // The control: accepted, the same write does clear it. Without this
            // half the test above would pass just as well against a build that
            // never cleared a mark at all.
            (await client.PutCollectionAsync(created with { Items = [Item("i1", "Has the photo", photo)] }))
                .EnsureSuccessStatusCode();
            Assert.Null(await MarkAsync(photo));
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    // --- the precondition itself ---

    [Fact]
    public async Task APutWithNoIfMatch_IsRefused_AndWritesNothing()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "No precondition");

        try
        {
            var before = await SnapshotAsync(created.Id);
            var response = await client.PutAsJsonAsync(
                $"/api/collections/{created.Id}",
                created with { Name = "Snuck in" });

            // 428, not "accepted because the client did not object": a
            // precondition that only applies when asked for protects nobody.
            Assert.Equal(HttpStatusCode.PreconditionRequired, response.StatusCode);
            Assert.Equal(before, await SnapshotAsync(created.Id));
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Theory]
    // "*" is a valid If-Match meaning "if the resource exists at all" — which
    // would be an opt-out wearing the right clothes, so it is refused as no
    // precondition rather than honoured.
    [InlineData("*", HttpStatusCode.PreconditionRequired)]
    // If-Match compares strongly, so a weak tag can never identify a version.
    [InlineData("W/\"1\"", HttpStatusCode.PreconditionRequired)]
    [InlineData("not-a-tag", HttpStatusCode.PreconditionRequired)]
    // An empty tag is a different thing: well-formed, and simply not the current
    // version. That is a mismatch, and a mismatch is a 412 — the client sent a
    // precondition, it just sent the wrong one.
    [InlineData("\"\"", HttpStatusCode.PreconditionFailed)]
    public async Task APreconditionThatCannotIdentifyAVersion_IsRefused(
        string header,
        HttpStatusCode expected)
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, $"Bad precondition {Guid.NewGuid():N}");

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Put, $"/api/collections/{created.Id}")
            {
                Content = JsonContent.Create(created with { Name = "Snuck in" }),
            };
            request.Headers.TryAddWithoutValidation("If-Match", header);

            var response = await client.SendAsync(request);
            Assert.Equal(expected, response.StatusCode);

            // Whichever refusal it earns, nothing was written.
            Assert.Equal(created.Name, (await StoredAsync(created.Id)).Name);
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task ASuccessfulWrite_AnswersWithANewVersion_TheClientCanKeepUsing()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Keeps editing");

        try
        {
            var first = await client.GetCollectionVersionAsync(created.Id);

            var one = await client.PutCollectionAsync(created with { Name = "First edit" }, first);
            one.EnsureSuccessStatusCode();
            var second = one.Headers.ETag!.ToString();
            Assert.NotEqual(first, second);

            // The point of returning it: a client that saves twice in a row must
            // not have to re-read the whole vault in between.
            var two = await client.PutCollectionAsync(created with { Name = "Second edit" }, second);
            two.EnsureSuccessStatusCode();
            Assert.NotEqual(second, two.Headers.ETag!.ToString());

            // …and the one it has replaced is dead.
            var reused = await client.PutCollectionAsync(created with { Name = "Third edit" }, second);
            Assert.Equal(HttpStatusCode.PreconditionFailed, reused.StatusCode);
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task EvenAPutThatChangesNothing_AdvancesTheVersion()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "No-op");

        try
        {
            var before = await client.GetCollectionVersionAsync(created.Id);
            var response = await client.PutCollectionAsync(created, before);
            response.EnsureSuccessStatusCode();

            // Otherwise a write whose payload happened to match what was stored
            // would issue no UPDATE at all, so nothing would be checked, and the
            // caller would be handed back a token that is only accidentally
            // still current.
            Assert.NotEqual(before, response.Headers.ETag!.ToString());
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    // --- granularity: item writes and the collection's version ---

    [Fact]
    public async Task AnItemWrite_MovesTheCollectionsVersion_SoAStalePutCannotUndoIt()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Item edits count");

        try
        {
            var stale = await client.GetCollectionVersionAsync(created.Id);

            var upsert = await client.PutItemAsync(created.Id, Item("i1", "Added by the other tab"), stale);
            upsert.EnsureSuccessStatusCode();

            // The item endpoint writes one row and no column on the collection —
            // so if the version did not follow, a client that never saw this item
            // would PUT the whole document, pass its precondition, and delete it.
            var refused = await client.PutCollectionAsync(created with { Items = [] }, stale);
            Assert.Equal(HttpStatusCode.PreconditionFailed, refused.StatusCode);

            var stored = await StoredAsync(created.Id);
            Assert.Equal("Added by the other tab", Assert.Single(stored.Items).Name);
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task DeletingAnItem_MovesTheVersion_SoAStalePutCannotResurrectIt()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Deletes count too");

        try
        {
            var withItem = created with { Items = [Item("i1", "Doomed")] };
            (await client.PutCollectionAsync(withItem)).EnsureSuccessStatusCode();
            var stale = await client.GetCollectionVersionAsync(created.Id);

            // A delete takes no precondition — it is intent about one item, not a
            // document derived from a read — but it still has to move the version.
            var deleted = await client.DeleteAsync($"/api/collections/{created.Id}/items/i1");
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

            var fresh = deleted.Headers.ETag!.ToString();
            Assert.NotEqual(stale, fresh);

            var refused = await client.PutCollectionAsync(withItem, stale);
            Assert.Equal(HttpStatusCode.PreconditionFailed, refused.StatusCode);
            Assert.Empty((await StoredAsync(created.Id)).Items);

            // The version the delete answered with is usable, so a client is not
            // locked out by a change it made itself.
            (await client.PutCollectionAsync(created with { Name = "Carrying on" }, fresh))
                .EnsureSuccessStatusCode();
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task AnItemWrite_NeedsItsCollectionsVersion()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Items are guarded");

        try
        {
            var stale = await client.GetCollectionVersionAsync(created.Id);
            (await client.PutCollectionAsync(created with { Name = "Moved on" }, stale))
                .EnsureSuccessStatusCode();

            var missing = await client.PutAsJsonAsync(
                $"/api/collections/{created.Id}/items/i1",
                Item("i1", "No precondition"));
            Assert.Equal(HttpStatusCode.PreconditionRequired, missing.StatusCode);

            var superseded = await client.PutItemAsync(created.Id, Item("i1", "Stale"), stale);
            Assert.Equal(HttpStatusCode.PreconditionFailed, superseded.StatusCode);

            Assert.Empty((await StoredAsync(created.Id)).Items);
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task ARejectedItemWrite_DoesNotClearAnImagesCollectionMark()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Item marks survive a refusal");
        var photo = await UploadAsync(client);

        try
        {
            var stale = await client.GetCollectionVersionAsync(created.Id);
            (await client.PutCollectionAsync(created with { Name = "Moved on" }, stale))
                .EnsureSuccessStatusCode();

            var marked = DateTimeOffset.UtcNow.AddDays(-3);
            await SetMarkAsync(photo, marked);

            var refused = await client.PutItemAsync(created.Id, Item("i1", "Has the photo", photo), stale);
            Assert.Equal(HttpStatusCode.PreconditionFailed, refused.StatusCode);
            Assert.Equal(marked, await MarkAsync(photo));
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task RewritingOnlyAnItemsJsonColumn_StillMovesTheVersion()
    {
        // The change EF records against a JSON column's owned entities and not
        // against the row that carries it. Matching on entity type alone, the
        // interceptor would see nothing here — no bump, and no UPDATE of the root
        // either, so the concurrency token would not be consulted at all and the
        // write would go through completely unguarded. The request paths call
        // Touch and are covered twice over; this is what covers a path that does
        // not, which is exactly what a safety net is for.
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "JSON only");

        try
        {
            (await client.PutCollectionAsync(created with { Items = [Item("i1", "Has copies")] }))
                .EnsureSuccessStatusCode();

            var tenantId = await factory.QueryDbAsync(db => db.Collections
                .IgnoreQueryFilters()
                .Where(c => c.Id == created.Id)
                .Select(c => c.TenantId)
                .FirstAsync());

            await using var db = NewContext(tenantId);
            var repository = new CollectionRepository(db);
            var collection = (await repository.GetAsync(created.Id, default))!;
            var before = collection.Version;

            // Only the JSON document changes; not one column on Items or
            // Collections is assigned, and Touch is deliberately not called.
            collection.Items[0].Copies =
            [
                new ItemCopy { Id = "cp1", Condition = Condition.Good, Price = 10m },
            ];
            await db.SaveChangesAsync();

            Assert.Equal(before + 1, collection.Version);
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    // --- deletes: no precondition demanded, one offered is honoured ---

    [Fact]
    public async Task ADeleteOffersNoPrecondition_ButIsHeldToOneItSends()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Careful delete");

        try
        {
            var stale = await client.GetCollectionVersionAsync(created.Id);
            (await client.PutCollectionAsync(created with { Items = [Item("i1", "Later work")] }, stale))
                .EnsureSuccessStatusCode();

            // A client that volunteers a precondition has said something about
            // the state it expects, and RFC 9110 requires that to be evaluated.
            // Ignoring it would make the safest thing a caller can do
            // indistinguishable from the least safe.
            var item = await SendAsync(client, HttpMethod.Delete,
                $"/api/collections/{created.Id}/items/i1", stale);
            Assert.Equal(HttpStatusCode.PreconditionFailed, item.StatusCode);
            Assert.Single((await StoredAsync(created.Id)).Items);

            var collection = await SendAsync(client, HttpMethod.Delete,
                $"/api/collections/{created.Id}", stale);
            Assert.Equal(HttpStatusCode.PreconditionFailed, collection.StatusCode);

            // And with no precondition at all it simply goes, which is the
            // documented behaviour and the common case.
            var fresh = await client.GetCollectionVersionAsync(created.Id);
            var honoured = await SendAsync(client, HttpMethod.Delete,
                $"/api/collections/{created.Id}/items/i1", fresh);
            Assert.Equal(HttpStatusCode.NoContent, honoured.StatusCode);
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    // --- the wire contract ---

    [Fact]
    public async Task EveryCollectionInTheListCarriesTheVersionAWriteMustQuote()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var created = await CreateAsync(client, "Listed with a version");

        try
        {
            var listed = await client.GetVersionedCollectionsAsync();
            var mine = Assert.Single(listed, v => v.Collection.Id == created.Id);

            // A tag, quotes included: the client echoes it into If-Match without
            // parsing it, which is what would let this become a rowversion later.
            Assert.Matches("^\"[^\"]+\"$", mine.Version);
            Assert.True(EntityTagHeaderValue.TryParse(mine.Version, out _));

            (await client.PutCollectionAsync(created with { Name = "From the list" }, mine.Version))
                .EnsureSuccessStatusCode();

            // The envelope is beside the document, never inside it: CollectionDto
            // is also the archive's on-disk format, and a concurrency token has
            // no business in a backup.
            var raw = await client.GetFromJsonAsync<JsonElement>("/api/collections");
            var element = raw.EnumerateArray()
                .Single(e => e.GetProperty("collection").GetProperty("id").GetString() == created.Id);
            Assert.False(element.GetProperty("collection").TryGetProperty("version", out _));
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task ANewCollection_ArrivesWithAVersionItCanBeSavedWith()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var response = await client.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest("Born with a version", ""));
        response.EnsureSuccessStatusCode();
        var created = (await response.Content.ReadFromJsonAsync<CollectionDto>())!;

        try
        {
            var etag = response.Headers.ETag;
            Assert.NotNull(etag);

            // Without this the very first save after creating a collection would
            // need a full reload of the vault to find its version.
            (await client.PutCollectionAsync(created with { Name = "Saved straight away" }, etag.ToString()))
                .EnsureSuccessStatusCode();
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    [Fact]
    public async Task TheRefusalIsLocalized()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        client.DefaultRequestHeaders.AcceptLanguage.Add(new StringWithQualityHeaderValue("pt-BR"));
        var created = await CreateAsync(client, "Recusa traduzida");

        try
        {
            var stale = await client.GetCollectionVersionAsync(created.Id);
            (await client.PutCollectionAsync(created with { Name = "Seguiu em frente" }, stale))
                .EnsureSuccessStatusCode();

            var refused = await client.PutCollectionAsync(created, stale);
            var problem = await refused.Content.ReadFromJsonAsync<JsonElement>();

            var ptBR = CultureInfo.GetCultureInfo("pt-BR");
            var en = CultureInfo.GetCultureInfo("en");
            Assert.Equal(
                Messages.In(nameof(Messages.ProblemPreconditionFailed), ptBR),
                problem.GetProperty("title").GetString());
            Assert.Equal(
                Messages.In(nameof(Messages.CollectionChangedElsewhere), ptBR),
                problem.GetProperty("detail").GetString());

            // A host whose own culture happened to be pt-BR would pass the above
            // without the pipeline doing anything, so the English half is what
            // makes it a real assertion.
            Assert.NotEqual(
                Messages.In(nameof(Messages.CollectionChangedElsewhere), en),
                problem.GetProperty("detail").GetString());
        }
        finally
        {
            await DeleteAsync(client, created.Id);
        }
    }

    // --- helpers ---

    private static ItemDto Item(string id, string name, Guid? photo = null) =>
        new(
            Id: id,
            Name: name,
            Description: string.Empty,
            Year: 1994,
            Value: 10m,
            GroupId: string.Empty,
            Tags: [],
            Img: string.Empty,
            Custom: [],
            PhotoIds: photo is { } p ? [p] : []);

    private static async Task<CollectionDto> CreateAsync(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest(name, string.Empty));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CollectionDto>())!;
    }

    private static Task DeleteAsync(HttpClient client, string id) =>
        client.DeleteAsync($"/api/collections/{id}");

    /// <summary>A request carrying an explicit <c>If-Match</c> and no body.</summary>
    private static Task<HttpResponseMessage> SendAsync(
        HttpClient client,
        HttpMethod method,
        string url,
        string ifMatch)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.IfMatch.Add(EntityTagHeaderValue.Parse(ifMatch));
        return client.SendAsync(request);
    }

    /// <summary>
    /// What storage holds, read back through a client of its own.
    /// </summary>
    /// <remarks>
    /// Through the API rather than through the DbContext deliberately: the
    /// question these tests ask is what the next reader sees, and reading the
    /// rows directly would answer a slightly different one.
    /// </remarks>
    private async Task<CollectionDto> StoredAsync(string id)
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var all = await client.GetCollectionsAsync();
        return all.Single(c => c.Id == id);
    }

    /// <summary>The stored document as JSON, for byte-identical comparisons.</summary>
    private async Task<string> SnapshotAsync(string id) =>
        JsonSerializer.Serialize(await StoredAsync(id));

    private static async Task<Guid> UploadAsync(HttpClient client)
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(TinyPng);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(content, "file", "pixel.png");

        var response = await client.PostAsync("/api/images", form);
        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<JsonElement>();
        return created.GetProperty("id").GetGuid();
    }

    /// <summary>
    /// A context of its own, with the real interceptors, so two of them can be
    /// held open at once and made to collide.
    /// </summary>
    private VaultDbContext NewContext(Guid tenantId) =>
        new(
            new DbContextOptionsBuilder<VaultDbContext>()
                .UseSqlServer(factory.ConnectionString)
                .AddInterceptors(
                    new CollectionVersionInterceptor(),
                    new TenantStampingInterceptor(new FixedTenant(tenantId)))
                .Options,
            new FixedTenant(tenantId));

    private Task SetMarkAsync(Guid id, DateTimeOffset when) =>
        factory.QueryDbAsync(db => db.Images
            .IgnoreQueryFilters()
            .Where(i => i.Id == id)
            .ExecuteUpdateAsync(set => set.SetProperty(i => i.UnreferencedSinceUtc, (DateTimeOffset?)when)));

    private Task<DateTimeOffset?> MarkAsync(Guid id) =>
        factory.QueryDbAsync(db => db.Images
            .IgnoreQueryFilters()
            .Where(i => i.Id == id)
            .Select(i => i.UnreferencedSinceUtc)
            .FirstOrDefaultAsync());

    /// <summary>An authenticated caller from one specific tenant.</summary>
    private sealed class FixedTenant(Guid tenantId) : ICurrentTenant
    {
        public bool IsAuthenticated => true;

        public Guid TenantId => tenantId;

        public Guid UserId => Guid.Empty;

        public string Role => "Owner";
    }
}
