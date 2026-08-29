using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Vault.Api.Infrastructure;
using Vault.Application.Abstractions;
using Vault.Application.Collections.Dtos;
using Vault.Application.Images;
using Vault.Infrastructure;
using Vault.Infrastructure.Persistence;
using Vault.Infrastructure.Persistence.Repositories;
using Vault.Infrastructure.Storage;

namespace Vault.IntegrationTests;

/// <summary>
/// The garbage collector against real SQL Server, real query filters and real
/// files. The unit tests pin what it decides; this pins that the decisions are
/// taken over the whole installation rather than over whatever slice a query
/// filter happened to leave visible.
/// </summary>
/// <remarks>
/// Every test here backdates its own rows rather than moving a clock, because
/// backdating exercises the persisted mark — the thing the design actually
/// rests on — instead of a fake around it. Nothing else in the suite is
/// disturbed: a sweep marks other tests' fresh uploads and collects none of
/// them, since a fresh mark and a fresh creation stamp both fail the grace
/// check.
/// </remarks>
[Collection(nameof(ApiCollection))]
public class ImageGarbageCollectionTests(VaultApiFactory factory)
{
    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    private static readonly TimeSpan Grace = TimeSpan.FromDays(30);

    private static ImageGcPolicy Policy(bool dryRun = false, bool orphans = true) =>
        new(Grace, 500, dryRun, orphans);

    [Fact]
    public async Task AnImageReferencedByACollection_IsNeverCollected_HoweverItIsReferenced()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");

        var banner = await UploadAsync(client);
        var icon = await UploadAsync(client);
        var cover = await UploadAsync(client);
        var second = await UploadAsync(client);

        var id = await CreateCollectionAsync(client, "gc-referenced");
        await PutAsync(client, new CollectionDto(
            id, "GC referenced", "", [], [
                new ItemDto(
                    "gc-ref-item", "Photographed", "", 2020, 10, "", [], "x.jpg", [],
                    PhotoIds: [cover, second]),
            ], [], true, BannerImageId: banner, IconImageId: icon));

        // The worst case the design has to survive: rows already carrying a
        // stale mark from a sweep taken while the reference was briefly absent,
        // old enough on every clock. Only reachability may save them now.
        await BackdateAsync([banner, icon, cover, second], TimeSpan.FromDays(100));

        var report = await SweepAsync(Policy());

        Assert.DoesNotContain(report.Images, i => Doomed(i.Id, banner, icon, cover, second));
        foreach (var image in new[] { banner, icon, cover, second })
        {
            Assert.True(await RowExistsAsync(image), $"{image} lost its row");
            Assert.True(await BytesExistAsync(image), $"{image} lost its bytes");
            // The stale mark is cleared, so its clock starts again from scratch
            // if it is ever genuinely dereferenced.
            Assert.Null(await MarkAsync(image));
        }

        await client.DeleteAsync($"/api/collections/{id}");
    }

    [Fact]
    public async Task TheCoverIsJustPhotoIdsZero_AndIsSparedByTheSameRule()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var cover = await UploadAsync(client);

        var id = await CreateCollectionAsync(client, "gc-cover");
        await PutAsync(client, new CollectionDto(
            id, "GC cover", "", [], [
                new ItemDto("gc-cover-item", "Only a cover", "", 2020, 1, "", [], "x.jpg", [],
                    PhotoIds: [cover]),
            ], [], true));

        await BackdateAsync([cover], TimeSpan.FromDays(100));
        await SweepAsync(Policy());

        Assert.True(await RowExistsAsync(cover));
        Assert.True(await BytesExistAsync(cover));

        await client.DeleteAsync($"/api/collections/{id}");
    }

    [Fact]
    public async Task AnImageReferencedOnlyThroughAnImportedArchive_IsNeverCollected()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var original = await UploadAsync(client);

        var id = await CreateCollectionAsync(client, "gc-archive");
        await PutAsync(client, new CollectionDto(
            id, "GC archive", "", [], [
                new ItemDto("gc-archive-item", "Archived", "", 2020, 1, "", [], "x.jpg", [],
                    PhotoIds: [original]),
            ], [], true));

        var archive = await client.GetByteArrayAsync($"/api/export/collections/{id}");
        await client.DeleteAsync($"/api/collections/{id}");

        // The import writes every photo afresh under a new id in the importing
        // tenant's storage and remaps the references. Those new rows are only
        // ever reachable through the collection the import created.
        var restored = await ImportAsync(client, archive);
        var imported = restored.Single().Items.Single().PhotoIds.Single();
        Assert.NotEqual(original, imported);

        await BackdateAsync([imported], TimeSpan.FromDays(100));
        await SweepAsync(Policy());

        Assert.True(await RowExistsAsync(imported));
        Assert.True(await BytesExistAsync(imported));

        await client.DeleteAsync($"/api/collections/{restored.Single().Id}");
    }

    [Fact]
    public async Task AnUnreferencedImage_IsMarkedFirst_AndOnlyCollectedOnceTheGraceHasPassed()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var photo = await UploadAsync(client);

        var id = await CreateCollectionAsync(client, "gc-dropped");
        await PutAsync(client, new CollectionDto(
            id, "GC dropped", "", [], [
                new ItemDto("gc-dropped-item", "Had a photo", "", 2020, 1, "", [], "x.jpg", [],
                    PhotoIds: [photo]),
            ], [], true));

        // Read it back at the display size so a rendition is cached on disk too.
        (await factory.CreateClient().GetAsync($"/api/images/{photo}")).EnsureSuccessStatusCode();
        Assert.True(DerivedExists(await TenantOfAsync(photo), photo));

        // The photo is dropped from the item — exactly what a stale
        // full-document PUT does by accident.
        await PutAsync(client, new CollectionDto(
            id, "GC dropped", "", [], [
                new ItemDto("gc-dropped-item", "Had a photo", "", 2020, 1, "", [], "x.jpg", []),
            ], [], true));

        var marking = await SweepAsync(Policy());
        Assert.DoesNotContain(marking.Images, i => i.Id == photo);
        Assert.NotNull(await MarkAsync(photo));
        Assert.True(await BytesExistAsync(photo), "the grace period had not passed");

        var tenant = await TenantOfAsync(photo);
        await BackdateAsync([photo], TimeSpan.FromDays(100));
        var sweep = await SweepAsync(Policy());

        Assert.Contains(sweep.Images, i => i.Id == photo && i.TenantId == tenant);
        Assert.False(await RowExistsAsync(photo));
        Assert.False(await BytesExistAsync(photo));
        Assert.False(DerivedExists(tenant, photo), "the cached renditions outlived the original");

        await client.DeleteAsync($"/api/collections/{id}");
    }

    [Fact]
    public async Task SavingACollection_ClearsTheMarkItself_WithoutWaitingForASweep()
    {
        // The sweep only learns what it looks at. Without this, a reference that
        // appeared and disappeared between two sweeps would leave the image
        // running on a clock started before it was ever used — so the real undo
        // window would be the sweep interval, not the grace period, and the
        // guarantee the whole design rests on would be false.
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var photo = await UploadAsync(client);

        await SweepAsync(Policy());
        Assert.NotNull(await MarkAsync(photo));

        var id = await CreateCollectionAsync(client, "gc-clears-on-write");
        await PutAsync(client, new CollectionDto(
            id, "GC clears on write", "", [], [], [], true, BannerImageId: photo));

        // No sweep in between.
        Assert.Null(await MarkAsync(photo));

        await client.DeleteAsync($"/api/collections/{id}");
    }

    [Fact]
    public async Task SavingASingleItem_ClearsTheMarkOnItsPhotos()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var photo = await UploadAsync(client);

        var id = await CreateCollectionAsync(client, "gc-item-clears");
        await SweepAsync(Policy());
        Assert.NotNull(await MarkAsync(photo));

        // The narrower endpoint has to do it too: it is the one the item form
        // actually calls.
        var item = new ItemDto(
            "gc-item-clears-1", "Photographed", "", 2020, 1, "", [], "x.jpg", [],
            Copies: [new ItemCopyDto("gc-item-clears-1_c1", "Good", 5)],
            PhotoIds: [photo]);
        (await client.PutItemAsync(id, item))
            .EnsureSuccessStatusCode();

        Assert.Null(await MarkAsync(photo));

        await client.DeleteAsync($"/api/collections/{id}");
    }

    [Fact]
    public async Task ClearingTheMarkFromARequest_CannotReachAnotherTenantsImage()
    {
        // The write-path clear takes ids from a request body, so it is
        // tenant-filtered — unlike the sweep's, which has no ambient tenant and
        // must be global. Clearing a mark only ever spares an image, but a
        // foreign id still has to simply not exist.
        await factory.EnsureSecondTenantAsync();
        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);
        var globexPhoto = await UploadAsync(gary);

        await SweepAsync(Policy());
        var marked = await MarkAsync(globexPhoto);
        Assert.NotNull(marked);

        // Acme points a collection at globex's image id and saves.
        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var id = await CreateCollectionAsync(marcus, "gc-foreign-clear");
        await PutAsync(marcus, new CollectionDto(
            id, "GC foreign clear", "", [], [], [], true, BannerImageId: globexPhoto));

        Assert.Equal(marked, await MarkAsync(globexPhoto));

        await marcus.DeleteAsync($"/api/collections/{id}");
    }

    [Fact]
    public async Task ReachabilityIsReadAcrossEveryTenant_NotJustTheOneInScope()
    {
        // The bug this exists to catch: drop IgnoreQueryFilters from the
        // reachability query and it answers with only the ambient tenant's
        // references, so every other tenant's live photographs read as garbage.
        await factory.EnsureSecondTenantAsync();

        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);
        var globexPhoto = await UploadAsync(gary);
        var globexCollection = await CreateCollectionAsync(gary, "gc-globex");
        await PutAsync(gary, new CollectionDto(
            globexCollection, "GC globex", "", [], [
                new ItemDto("gc-globex-item", "Globex", "", 2020, 1, "", [], "x.jpg", [],
                    PhotoIds: [globexPhoto]),
            ], [], true));

        await BackdateAsync([globexPhoto], TimeSpan.FromDays(100));

        // Run the sweep with acme, not globex, as the ambient tenant.
        var acme = await TenantIdAsync("acme-vault");
        var report = await SweepAsync(Policy(), new FixedTenant(acme));

        Assert.DoesNotContain(report.Images, i => i.Id == globexPhoto);
        Assert.True(await RowExistsAsync(globexPhoto));
        Assert.True(await BytesExistAsync(globexPhoto));

        await gary.DeleteAsync($"/api/collections/{globexCollection}");
    }

    [Fact]
    public async Task ASweep_CollectsOneTenantsGarbageAndLeavesAnothersAlone()
    {
        await factory.EnsureSecondTenantAsync();

        var marcus = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var gary = await factory.CreateAuthenticatedClientAsync(VaultApiFactory.GlobexOwnerEmail);

        var acmeGarbage = await UploadAsync(marcus);
        var globexKeeper = await UploadAsync(gary);

        var globexCollection = await CreateCollectionAsync(gary, "gc-neighbour");
        await PutAsync(gary, new CollectionDto(
            globexCollection, "GC neighbour", "", [], [], [], true, BannerImageId: globexKeeper));

        var acmeTenant = await TenantOfAsync(acmeGarbage);
        var globexTenant = await TenantOfAsync(globexKeeper);
        Assert.NotEqual(acmeTenant, globexTenant);

        await BackdateAsync([acmeGarbage, globexKeeper], TimeSpan.FromDays(100));
        var report = await SweepAsync(Policy());

        Assert.Contains(report.Images, i => i.Id == acmeGarbage && i.TenantId == acmeTenant);
        Assert.False(await BytesExistAsync(acmeGarbage));

        Assert.DoesNotContain(report.Images, i => i.Id == globexKeeper);
        Assert.True(await RowExistsAsync(globexKeeper));
        Assert.True(await BytesExistAsync(globexKeeper));
        // And its bytes never left its own directory.
        Assert.True(File.Exists(OriginalPath(globexTenant, globexKeeper)));

        await gary.DeleteAsync($"/api/collections/{globexCollection}");
    }

    [Fact]
    public async Task ADryRun_ReportsWhatItWouldRemoveAndRemovesNothing()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var photo = await UploadAsync(client);
        await BackdateAsync([photo], TimeSpan.FromDays(100));
        var markBefore = await MarkAsync(photo);

        var report = await SweepAsync(Policy(dryRun: true));

        Assert.True(report.DryRun);
        Assert.Contains(report.Images, i => i.Id == photo);
        Assert.True(await RowExistsAsync(photo));
        Assert.True(await BytesExistAsync(photo));
        // Not even the marks moved — a dry run writes no column at all.
        Assert.Equal(markBefore, await MarkAsync(photo));

        // And a real sweep afterwards does exactly what the dry run described.
        var real = await SweepAsync(Policy());
        Assert.Contains(real.Images, i => i.Id == photo);
        Assert.False(await BytesExistAsync(photo));
    }

    [Fact]
    public async Task BytesWithNoMetadataRow_AreReclaimedOnlyOnceTheyAreOlderThanTheGrace()
    {
        var tenant = await TenantIdAsync("acme-vault");
        var store = factory.Services.GetRequiredService<IImageStore>();

        var ancient = Guid.NewGuid();
        var recent = Guid.NewGuid();
        await store.SaveAsync(tenant, ancient, "image/png", TinyPng, default);
        await store.SaveAsync(tenant, recent, "image/png", TinyPng, default);
        File.SetLastWriteTimeUtc(
            OriginalPath(tenant, ancient),
            DateTime.UtcNow - Grace - TimeSpan.FromDays(1));

        var report = await SweepAsync(Policy());

        Assert.Contains(report.Orphans, o => o.ImageId == ancient);
        Assert.False(File.Exists(OriginalPath(tenant, ancient)));

        // A file this new is routinely a photo being uploaded right now: the
        // bytes land before the row, on every single upload.
        Assert.DoesNotContain(report.Orphans, o => o.ImageId == recent);
        Assert.True(File.Exists(OriginalPath(tenant, recent)));

        File.Delete(OriginalPath(tenant, recent));
    }

    [Fact]
    public async Task ASweep_RunsWithNoAmbientTenantAtAll()
    {
        // Production shape: a background service has no HttpContext, so
        // ICurrentTenant reports unauthenticated and TenantId throws. Any query
        // in the sweep that still went through the global filter would fail here
        // loudly rather than silently answering "nothing is referenced".
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");
        var banner = await UploadAsync(client);
        var id = await CreateCollectionAsync(client, "gc-no-ambient");
        await PutAsync(client, new CollectionDto(
            id, "GC no ambient", "", [], [], [], true, BannerImageId: banner));

        var report = await SweepAsync(Policy(dryRun: true), new UnauthenticatedTenant());

        // Both halves came back with data. A query that had lost its
        // IgnoreQueryFilters would have thrown here rather than answering zero,
        // which is the one saving grace of the filter throwing outside a request.
        Assert.True(report.ImagesScanned > 0, "no image rows were read");
        Assert.True(report.ReferencedIds > 0, "no references were read");
        Assert.Contains(banner, await ReferencedIdsAsync());

        await client.DeleteAsync($"/api/collections/{id}");
    }

    private async Task<HashSet<Guid>> ReferencedIdsAsync()
    {
        await using var db = NewContext(new UnauthenticatedTenant());
        return await new CollectionRepository(db).ListReferencedImageIdsAcrossAllTenantsAsync(default);
    }

    [Fact]
    public void TheCollector_IsNotEvenRegisteredUnlessAnOperatorAsksForIt()
    {
        // The default is inert, and inert here means absent rather than idle:
        // this test host, like a development machine, never has a sweep in it.
        Assert.DoesNotContain(
            factory.Services.GetServices<IHostedService>(),
            service => service is ImageGarbageCollectionService);
    }

    [Theory]
    [InlineData("ImageGc:GracePeriod", "00:00:01")]   // a grace that is not one
    [InlineData("ImageGc:GracePeriod", "00:59:59")]   // just under the floor
    [InlineData("ImageGc:Interval", "00:00:00")]
    [InlineData("ImageGc:InitialDelay", "-00:00:01")]
    [InlineData("ImageGc:BatchSize", "0")]
    public void ADangerousConfiguration_FailsRatherThanBeingRoundedIntoSomethingPlausible(
        string key,
        string value)
    {
        Assert.Throws<OptionsValidationException>(() => Bind(key, value));
    }

    [Fact]
    public void TheFloorIsExactlyAnHour_AndAValidSectionBinds()
    {
        var bound = Bind("ImageGc:GracePeriod", "01:00:00");

        Assert.Equal(ImageGcOptions.MinimumGracePeriod, bound.GracePeriod);
        // And the shipped defaults are the inert ones.
        Assert.False(new ImageGcOptions().Enabled);
        Assert.True(new ImageGcOptions().DryRun);
    }

    private static ImageGcOptions Bind(string key, string value)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Vault"] = "Server=unused;Database=unused;",
                ["Jwt:SigningKey"] = "a-signing-key-long-enough-for-validation-0123456789",
                [key] = value,
            })
            .Build();

        var services = new ServiceCollection();
        // BindConfiguration resolves IConfiguration from the container, which a
        // host would have registered for us.
        services.AddSingleton<IConfiguration>(configuration);
        services.AddInfrastructure(configuration, AppContext.BaseDirectory);

        using var provider = services.BuildServiceProvider();
        return provider.GetRequiredService<IOptions<ImageGcOptions>>().Value;
    }

    // --- plumbing --------------------------------------------------------

    /// <summary>
    /// Builds the collector over its real repositories and the app's real image
    /// store, with a chosen ambient tenant.
    /// </summary>
    private async Task<ImageSweepReport> SweepAsync(
        ImageGcPolicy policy,
        ICurrentTenant? ambient = null)
    {
        await using var db = NewContext(ambient ?? new UnauthenticatedTenant());
        var collector = new ImageGarbageCollector(
            new CollectionRepository(db),
            new ImageRepository(db),
            factory.Services.GetRequiredService<IImageStore>(),
            TimeProvider.System);

        return await collector.SweepAsync(policy, default);
    }

    private VaultDbContext NewContext(ICurrentTenant tenant) =>
        new(
            new DbContextOptionsBuilder<VaultDbContext>().UseSqlServer(factory.ConnectionString).Options,
            tenant);

    /// <summary>Ages a row on both clocks the sweep consults.</summary>
    private Task BackdateAsync(IEnumerable<Guid> ids, TimeSpan by)
    {
        var doomed = ids.ToArray();
        var when = DateTimeOffset.UtcNow - by;
        return factory.QueryDbAsync(db => db.Images
            .IgnoreQueryFilters()
            .Where(i => doomed.Contains(i.Id))
            .ExecuteUpdateAsync(set => set
                .SetProperty(i => i.CreatedAtUtc, when)
                .SetProperty(i => i.UnreferencedSinceUtc, (DateTimeOffset?)when)));
    }

    private static bool Doomed(Guid candidate, params Guid[] ids) => ids.Contains(candidate);

    private Task<bool> RowExistsAsync(Guid id) =>
        factory.QueryDbAsync(db => db.Images.IgnoreQueryFilters().AnyAsync(i => i.Id == id));

    private Task<DateTimeOffset?> MarkAsync(Guid id) =>
        factory.QueryDbAsync(db => db.Images
            .IgnoreQueryFilters()
            .Where(i => i.Id == id)
            .Select(i => i.UnreferencedSinceUtc)
            .FirstOrDefaultAsync());

    private Task<Guid> TenantOfAsync(Guid id) =>
        factory.QueryDbAsync(db => db.Images
            .IgnoreQueryFilters()
            .Where(i => i.Id == id)
            .Select(i => i.TenantId)
            .FirstAsync());

    private Task<Guid> TenantIdAsync(string slug) =>
        factory.QueryDbAsync(db => db.Tenants.Where(t => t.Slug == slug).Select(t => t.Id).FirstAsync());

    private async Task<bool> BytesExistAsync(Guid id)
    {
        if (!await RowExistsAsync(id))
        {
            // Nothing left to address the bytes with; the file is gone or is
            // unreachable garbage either way.
            var tenants = Directory.Exists(factory.ImageRoot)
                ? Directory.GetDirectories(factory.ImageRoot)
                : [];
            return tenants.Any(t => File.Exists(Path.Combine(t, $"{id:D}.png")));
        }

        return File.Exists(OriginalPath(await TenantOfAsync(id), id));
    }

    private string OriginalPath(Guid tenantId, Guid imageId) =>
        Path.Combine(factory.ImageRoot, tenantId.ToString("D"), $"{imageId:D}.png");

    private bool DerivedExists(Guid tenantId, Guid imageId) =>
        Directory.Exists(Path.Combine(factory.ImageRoot, tenantId.ToString("D"), "derived"))
        && Directory
            .GetFiles(Path.Combine(factory.ImageRoot, tenantId.ToString("D"), "derived"))
            .Any(f => Path.GetFileName(f).StartsWith($"{imageId:D}_", StringComparison.Ordinal));

    private static async Task<Guid> UploadAsync(HttpClient client)
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(TinyPng);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(content, "file", "tiny.png");

        var response = await client.PostAsync("/api/images", form);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ImageUploadResponse>())!.Id;
    }

    private static async Task<string> CreateCollectionAsync(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/collections", new CreateCollectionRequest(name, ""));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CollectionDto>())!.Id;
    }

    private static async Task PutAsync(HttpClient client, CollectionDto collection) =>
        (await client.PutCollectionAsync(collection))
            .EnsureSuccessStatusCode();

    private static async Task<List<CollectionDto>> ImportAsync(HttpClient client, byte[] archive)
    {
        var content = new ByteArrayContent(archive);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
        var response = await client.PostAsync("/api/import", content);
        response.EnsureSuccessStatusCode();
        var imported = (await response.Content.ReadFromJsonAsync<List<VersionedCollectionDto>>())!;
        return [.. imported.Select(v => v.Collection)];
    }

    /// <summary>An authenticated caller from one specific tenant.</summary>
    private sealed class FixedTenant(Guid tenantId) : ICurrentTenant
    {
        public bool IsAuthenticated => true;

        public Guid TenantId => tenantId;

        public Guid UserId => Guid.Empty;

        public string Role => "Owner";
    }

    /// <summary>
    /// What a background scope really looks like: no principal, and an identity
    /// accessor that throws rather than quietly answering <c>Guid.Empty</c>.
    /// </summary>
    private sealed class UnauthenticatedTenant : ICurrentTenant
    {
        public bool IsAuthenticated => false;

        public Guid TenantId => throw new InvalidOperationException("No tenant in the current context.");

        public Guid UserId => throw new InvalidOperationException("No user in the current context.");

        public string Role => string.Empty;
    }
}
