using System.Runtime.CompilerServices;
using Microsoft.Extensions.Time.Testing;
using Vault.Application.Abstractions;
using Vault.Application.Images;
using Vault.Domain.Entities;
using Vault.Domain.Enums;

namespace Vault.UnitTests;

/// <summary>
/// Pins the collector's policy: what it marks, what it spares, and the exact
/// conditions under which it is allowed to destroy anything.
/// </summary>
/// <remarks>
/// These run against in-memory fakes because the interesting failures are
/// decisions, not SQL. The database and filesystem realities — the query
/// filters above all — are pinned in
/// <c>Vault.IntegrationTests.ImageGarbageCollectionTests</c>.
/// </remarks>
public sealed class ImageGarbageCollectorTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Grace = TimeSpan.FromDays(30);

    private readonly FakeTimeProvider _clock = new(Now);
    private readonly FakeCollectionRepository _collections = new();
    private readonly FakeImageRepository _images = new();
    private readonly FakeImageStore _store = new();

    private static ImageGcPolicy Policy(bool dryRun = false, int batchSize = 200, bool orphans = true) =>
        new(Grace, batchSize, dryRun, orphans);

    private ImageGarbageCollector Collector() =>
        new(_collections, _images, _store, _clock);

    [Fact]
    public async Task AnUnreferencedImage_IsMarked_AndNothingIsDeletedOnTheFirstSweep()
    {
        var tenant = Guid.NewGuid();
        var image = _images.Seed(tenant, createdAt: Now - TimeSpan.FromDays(400));
        _store.Seed(tenant, image, Now - TimeSpan.FromDays(400));

        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Equal(1, report.Marked);
        Assert.Empty(report.Images);
        Assert.Equal(Now, _images.Rows.Single().UnreferencedSinceUtc);
        // Old enough on the creation clock, brand new on the one that decides.
        Assert.True(_store.Exists(tenant, image));
    }

    [Fact]
    public async Task AnImageInsideTheGracePeriod_IsNeverCollected()
    {
        var tenant = Guid.NewGuid();
        var image = _images.Seed(
            tenant,
            createdAt: Now - TimeSpan.FromDays(400),
            unreferencedSince: Now - Grace + TimeSpan.FromMinutes(1));
        _store.Seed(tenant, image, Now - TimeSpan.FromDays(400));

        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Empty(report.Images);
        Assert.Equal(1, report.WaitingOutGrace);
        Assert.True(_store.Exists(tenant, image));
        Assert.Single(_images.Rows);
    }

    [Fact]
    public async Task AnImagePastTheGracePeriod_LosesItsRow_ItsBytesAndItsRenditions()
    {
        var tenant = Guid.NewGuid();
        var image = _images.Seed(
            tenant,
            createdAt: Now - TimeSpan.FromDays(400),
            unreferencedSince: Now - Grace);
        _store.Seed(tenant, image, Now - TimeSpan.FromDays(400));
        _store.SeedDerived(tenant, image, ImageVariant.Thumb, Now - TimeSpan.FromDays(400));
        _store.SeedDerived(tenant, image, ImageVariant.Display, Now - TimeSpan.FromDays(400));

        // orphans: false, so nothing but store.DeleteAsync can remove these
        // files — otherwise the stray-file pass would tidy them up afterwards
        // and this would pass with a DeleteAsync that did nothing.
        var report = await Collector().SweepAsync(Policy(orphans: false), default);

        var collected = Assert.Single(report.Images);
        Assert.Equal(image, collected.Id);
        Assert.Equal(tenant, collected.TenantId);
        Assert.Equal(3, collected.Files);
        Assert.Empty(_images.Rows);
        Assert.False(_store.Exists(tenant, image));
        Assert.Empty(_store.Objects);
    }

    [Fact]
    public async Task AReferencedImage_IsNeverCollected_AndItsStaleMarkIsThrownAway()
    {
        // Deliberately a Fact and not a Theory over "banner"/"icon"/"photo":
        // which columns count as a reference is decided by
        // CollectionImages.ReferencedBy and by the repository query, neither of
        // which is in play here — the fake answers with a flat set. Parameters
        // would promise coverage this shape of test cannot deliver.
        // CollectionImagesTests pins the routes.
        var tenant = Guid.NewGuid();
        var image = _images.Seed(
            tenant,
            createdAt: Now - TimeSpan.FromDays(400),
            unreferencedSince: Now - TimeSpan.FromDays(400));
        _store.Seed(tenant, image, Now - TimeSpan.FromDays(400));

        _collections.Referenced.Add(image);

        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Empty(report.Images);
        Assert.Equal(1, report.MarksCleared);
        Assert.Null(_images.Rows.Single().UnreferencedSinceUtc);
        Assert.True(_store.Exists(tenant, image));
    }

    [Fact]
    public async Task ReferencingAnImageAgain_ThrowsAwayItsClockRatherThanPausingIt()
    {
        var tenant = Guid.NewGuid();
        var image = _images.Seed(tenant, createdAt: Now - TimeSpan.FromDays(400));
        _store.Seed(tenant, image, Now - TimeSpan.FromDays(400));

        await Collector().SweepAsync(Policy(), default);
        Assert.Equal(Now, _images.Rows.Single().UnreferencedSinceUtc);

        // Someone puts it back on an item, 29 days into the grace period.
        _collections.Referenced.Add(image);
        _clock.Advance(TimeSpan.FromDays(29));
        await Collector().SweepAsync(Policy(), default);
        Assert.Null(_images.Rows.Single().UnreferencedSinceUtc);

        // And takes it off again. The clock restarts from zero, so the full
        // grace period is available a second time.
        _collections.Referenced.Remove(image);
        await Collector().SweepAsync(Policy(), default);
        _clock.Advance(Grace - TimeSpan.FromDays(1));
        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Empty(report.Images);
        Assert.Single(_images.Rows);
    }

    [Fact]
    public async Task AnImageReferencedBetweenTheTwoReachabilityReads_IsSpared()
    {
        var tenant = Guid.NewGuid();
        var image = _images.Seed(
            tenant,
            createdAt: Now - TimeSpan.FromDays(400),
            unreferencedSince: Now - Grace);
        _store.Seed(tenant, image, Now - TimeSpan.FromDays(400));

        // The collector reads reachability twice: once to decide, and once again
        // immediately before it destroys anything. A PUT that lands in between
        // must win.
        _collections.OnRead = reads =>
        {
            if (reads == 2)
            {
                _collections.Referenced.Add(image);
            }
        };

        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Empty(report.Images);
        Assert.Equal(1, report.SparedByRecheck);
        Assert.Single(_images.Rows);
        Assert.True(_store.Exists(tenant, image));
    }

    [Fact]
    public async Task ADryRun_ReportsExactlyWhatItWouldDoAndWritesNothingAtAll()
    {
        var tenant = Guid.NewGuid();
        var doomed = _images.Seed(
            tenant,
            createdAt: Now - TimeSpan.FromDays(400),
            unreferencedSince: Now - Grace);
        _store.Seed(tenant, doomed, Now - TimeSpan.FromDays(400));

        var fresh = _images.Seed(tenant, createdAt: Now - TimeSpan.FromDays(400));
        _store.Seed(tenant, fresh, Now - TimeSpan.FromDays(400));

        var stray = Guid.NewGuid();
        _store.Seed(tenant, stray, Now - TimeSpan.FromDays(400));

        var report = await Collector().SweepAsync(Policy(dryRun: true), default);

        Assert.True(report.DryRun);
        Assert.Equal(doomed, Assert.Single(report.Images).Id);
        Assert.Equal(1, report.Marked);
        Assert.Equal(stray, Assert.Single(report.Orphans).ImageId);

        // Not one byte and not one column changed.
        Assert.Equal(2, _images.Rows.Count);
        Assert.Null(_images.Rows.Single(r => r.Id == fresh).UnreferencedSinceUtc);
        Assert.True(_store.Exists(tenant, doomed));
        Assert.True(_store.Exists(tenant, stray));
    }

    [Fact]
    public async Task TheBatchSize_BoundsHowMuchOneSweepCanDestroy()
    {
        var tenant = Guid.NewGuid();
        for (var i = 0; i < 10; i++)
        {
            var image = _images.Seed(
                tenant,
                createdAt: Now - TimeSpan.FromDays(400),
                unreferencedSince: Now - Grace - TimeSpan.FromDays(i));
            _store.Seed(tenant, image, Now - TimeSpan.FromDays(400));
        }

        var report = await Collector().SweepAsync(Policy(batchSize: 3), default);

        Assert.Equal(3, report.Images.Count);
        Assert.Equal(7, _images.Rows.Count);
    }

    [Fact]
    public async Task AReferenceSparesAnImageWhicheverTenantOwnsIt()
    {
        // Reachability is one global set, so an image is spared because
        // something points at it, never because of whose it is. (That a delete
        // is *addressed* by the owning tenant is a different property, pinned by
        // EveryImageInABatch_IsDeletedUnderItsOwnTenant and, against real
        // tenants, by the integration suite.)
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();

        var doomed = _images.Seed(a, Now - TimeSpan.FromDays(400), Now - Grace);
        _store.Seed(a, doomed, Now - TimeSpan.FromDays(400));

        var keptById = _images.Seed(b, Now - TimeSpan.FromDays(400), Now - Grace);
        _store.Seed(b, keptById, Now - TimeSpan.FromDays(400));
        _collections.Referenced.Add(keptById);

        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Equal(doomed, Assert.Single(report.Images).Id);
        Assert.Equal(a, report.Images[0].TenantId);
        Assert.True(_store.Exists(b, keptById));
        Assert.Equal(keptById, _images.Rows.Single().Id);
    }

    [Fact]
    public async Task DeletionAddressesTheTenantOnTheImagesOwnRow_NotAnyOther()
    {
        // The same id living under two tenants is two different pictures. Only
        // the one whose row says so may be unlinked.
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var shared = Guid.NewGuid();

        _images.SeedWithId(shared, a, Now - TimeSpan.FromDays(400), Now - Grace);
        _store.Seed(a, shared, Now - TimeSpan.FromDays(400));
        _store.Seed(b, shared, Now - TimeSpan.FromDays(400));

        await Collector().SweepAsync(Policy(orphans: false), default);

        Assert.False(_store.Exists(a, shared));
        Assert.True(_store.Exists(b, shared));
    }

    [Fact]
    public async Task EveryImageInABatch_IsDeletedUnderItsOwnTenant()
    {
        // One sweep spans every tenant, so a batch holds rows from several. Each
        // one has to be addressed by the tenant on its own row: taking the
        // tenant from the batch — the first row's, the ambient one, any single
        // answer — leaves every other tenant's bytes on disk while their rows go,
        // and points the delete at a partition that is not theirs.
        var tenants = Enumerable.Range(0, 3).Select(_ => Guid.NewGuid()).ToArray();
        var seeded = new List<(Guid Tenant, Guid Image)>();

        for (var i = 0; i < tenants.Length; i++)
        {
            var image = _images.Seed(
                tenants[i],
                createdAt: Now - TimeSpan.FromDays(400),
                // Distinct marks, so the batch's order is deterministic and the
                // first row is not accidentally the right answer for the rest.
                unreferencedSince: Now - Grace - TimeSpan.FromDays(i));
            _store.Seed(tenants[i], image, Now - TimeSpan.FromDays(400));
            seeded.Add((tenants[i], image));
        }

        await Collector().SweepAsync(Policy(orphans: false), default);

        Assert.Equal(
            [.. seeded.OrderBy(x => x.Image)],
            [.. _store.Deletes.OrderBy(x => x.Image)]);
        Assert.Empty(_store.Objects);
        Assert.Empty(_images.Rows);
    }

    [Fact]
    public async Task AFileWhoseIdBelongsToAnotherTenantsRow_IsReportedAndLeftAlone()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var shared = Guid.NewGuid();

        _images.SeedWithId(shared, a, Now - TimeSpan.FromDays(400));
        _collections.Referenced.Add(shared);
        _store.Seed(a, shared, Now - TimeSpan.FromDays(400));
        _store.Seed(b, shared, Now - TimeSpan.FromDays(400));

        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Empty(report.Orphans);
        Assert.Equal(1, report.ForeignTenantFilesSkipped);
        Assert.True(_store.Exists(b, shared));
    }

    [Fact]
    public async Task BytesWithNoMetadataRow_AreCollectedOnlyOnceTheyAreOlderThanTheGracePeriod()
    {
        var tenant = Guid.NewGuid();
        var recent = Guid.NewGuid();
        var ancient = Guid.NewGuid();

        // The upload path writes bytes before the row, so a file with no row is
        // routinely a picture that is mid-upload right now.
        _store.Seed(tenant, recent, Now - TimeSpan.FromSeconds(2));
        _store.Seed(tenant, ancient, Now - Grace - TimeSpan.FromDays(1));

        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Equal(ancient, Assert.Single(report.Orphans).ImageId);
        Assert.True(_store.Exists(tenant, recent));
        Assert.False(_store.Exists(tenant, ancient));
    }

    [Fact]
    public async Task BytesWhoseRowStillExists_AreNeverCollectedAsOrphans()
    {
        var tenant = Guid.NewGuid();
        var image = _images.Seed(tenant, Now - TimeSpan.FromDays(400));
        _store.Seed(tenant, image, Now - TimeSpan.FromDays(400));
        _collections.Referenced.Add(image);

        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Empty(report.Orphans);
        Assert.True(_store.Exists(tenant, image));
    }

    [Fact]
    public async Task AFileStillNamedByACollection_IsSparedEvenWithNoRowBehindIt()
    {
        var tenant = Guid.NewGuid();
        var image = Guid.NewGuid();
        _store.Seed(tenant, image, Now - Grace - TimeSpan.FromDays(1));
        _collections.Referenced.Add(image);

        var report = await Collector().SweepAsync(Policy(), default);

        Assert.Empty(report.Orphans);
        Assert.True(_store.Exists(tenant, image));
    }

    [Fact]
    public async Task AnObjectTheStoreCannotAttribute_IsNeverACandidate()
    {
        var tenant = Guid.NewGuid();
        _store.Objects.Add(new StoredObject(
            tenant, null, StoredObjectKind.Staging,
            Now - Grace - TimeSpan.FromDays(1), 100, "unattributable"));

        var report = await Collector().SweepAsync(Policy(), default);

        // Nobody can say these bytes belong to nobody.
        Assert.Empty(report.Orphans);
        Assert.Single(_store.Objects);
    }

    [Fact]
    public async Task AStaleStagingFile_IsCollectedEvenWhenItsImageIsStillLive()
    {
        // A staging file is what a write that never completed its move leaves
        // behind, so it is garbage whatever the image's state — and holding it
        // back because the image is live would leak it for ever.
        var tenant = Guid.NewGuid();
        var image = _images.Seed(tenant, Now - TimeSpan.FromDays(400));
        _collections.Referenced.Add(image);
        _store.Seed(tenant, image, Now - TimeSpan.FromDays(400));
        _store.Objects.Add(new StoredObject(
            tenant, image, StoredObjectKind.Staging,
            Now - Grace - TimeSpan.FromDays(1), 7, $"{tenant}/{image}.png.abc.tmp"));

        var report = await Collector().SweepAsync(Policy(), default);

        var orphan = Assert.Single(report.Orphans);
        Assert.Equal(StoredObjectKind.Staging, orphan.Kind);
        // And the live image itself is untouched.
        Assert.True(_store.Exists(tenant, image));
        Assert.Single(_images.Rows);
    }

    [Fact]
    public async Task TurningOffTheOrphanPass_LeavesStrayFilesAlone()
    {
        var tenant = Guid.NewGuid();
        var stray = Guid.NewGuid();
        _store.Seed(tenant, stray, Now - Grace - TimeSpan.FromDays(1));

        var report = await Collector().SweepAsync(Policy(orphans: false), default);

        Assert.Empty(report.Orphans);
        Assert.True(_store.Exists(tenant, stray));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task AGracePeriodThatIsNotOne_IsRefusedOutright(int hours)
    {
        var policy = new ImageGcPolicy(TimeSpan.FromHours(hours), 200, false, true);

        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(
            () => Collector().SweepAsync(policy, default));
    }

    // --- fakes -----------------------------------------------------------

    private sealed class FakeCollectionRepository : ICollectionRepository
    {
        public HashSet<Guid> Referenced { get; } = [];

        public Action<int>? OnRead { get; set; }

        private int _reads;

        public Task<HashSet<Guid>> ListReferencedImageIdsAcrossAllTenantsAsync(CancellationToken ct)
        {
            OnRead?.Invoke(++_reads);
            return Task.FromResult(new HashSet<Guid>(Referenced));
        }

        public Task<List<Collection>> ListAsync(CancellationToken ct) => throw new NotSupportedException();

        public Task<List<CollectionIdentity>> ListIdentitiesAsync(CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<Collection?> GetAsync(string id, CancellationToken ct) => throw new NotSupportedException();

        public Task<bool> ExistsAsync(string id, CancellationToken ct) => throw new NotSupportedException();

        public void Add(Collection collection) => throw new NotSupportedException();

        public void Remove(Collection collection) => throw new NotSupportedException();

        public void ReplaceGraph(Collection tracked, Collection replacement) => throw new NotSupportedException();

        public void Touch(Collection collection) => throw new NotSupportedException();

        public Task SaveChangesAsync(CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class FakeImageRepository : IImageRepository
    {
        public List<StoredImage> Rows { get; } = [];

        public Guid Seed(
            Guid tenantId,
            DateTimeOffset createdAt,
            DateTimeOffset? unreferencedSince = null) =>
            SeedWithId(Guid.NewGuid(), tenantId, createdAt, unreferencedSince);

        public Guid SeedWithId(
            Guid id,
            Guid tenantId,
            DateTimeOffset createdAt,
            DateTimeOffset? unreferencedSince = null)
        {
            Rows.Add(new StoredImage
            {
                Id = id,
                TenantId = tenantId,
                ContentType = "image/png",
                CreatedAtUtc = createdAt,
                UnreferencedSinceUtc = unreferencedSince,
            });
            return id;
        }

        public Task<IReadOnlyList<ImageSweepRow>> ListAllForSweepAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<ImageSweepRow>>(
                [.. Rows.Select(r => new ImageSweepRow(
                    r.Id, r.TenantId, r.ContentType, r.CreatedAtUtc, r.UnreferencedSinceUtc))]);

        public Task<int> MarkUnreferencedAsync(
            IReadOnlyCollection<Guid> ids,
            DateTimeOffset atUtc,
            CancellationToken ct)
        {
            var affected = Rows.Where(r => ids.Contains(r.Id) && r.UnreferencedSinceUtc is null).ToArray();
            foreach (var row in affected)
            {
                row.UnreferencedSinceUtc = atUtc;
            }

            return Task.FromResult(affected.Length);
        }

        public Task<int> ClearUnreferencedMarkAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct)
        {
            var affected = Rows.Where(r => ids.Contains(r.Id) && r.UnreferencedSinceUtc is not null).ToArray();
            foreach (var row in affected)
            {
                row.UnreferencedSinceUtc = null;
            }

            return Task.FromResult(affected.Length);
        }

        public Task<int> ClearUnreferencedMarkForCurrentTenantAsync(
            IReadOnlyCollection<Guid> ids,
            CancellationToken ct) => ClearUnreferencedMarkAsync(ids, ct);

        public Task<int> DeleteRowsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
            Task.FromResult(Rows.RemoveAll(r => ids.Contains(r.Id)));

        public void Add(StoredImage image) => throw new NotSupportedException();

        public Task<StoredImage?> GetUnfilteredAsync(Guid id, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<StoredImage?> GetForCurrentTenantAsync(Guid id, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<List<StoredImage>> ListForCurrentTenantAsync(CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<List<StoredImage>> ListForCurrentTenantAsync(
            IReadOnlyCollection<Guid> ids,
            CancellationToken ct) => throw new NotSupportedException();

        public Task SaveChangesAsync(CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class FakeImageStore : IImageStore
    {
        public List<StoredObject> Objects { get; } = [];

        /// <summary>The (tenant, image) pairs <c>DeleteAsync</c> was asked for.</summary>
        public List<(Guid Tenant, Guid Image)> Deletes { get; } = [];

        public void Seed(Guid tenantId, Guid imageId, DateTimeOffset writtenAt) =>
            Objects.Add(new StoredObject(
                tenantId, imageId, StoredObjectKind.Original, writtenAt, 100, $"{tenantId}/{imageId}"));

        public void SeedDerived(Guid tenantId, Guid imageId, ImageVariant variant, DateTimeOffset writtenAt) =>
            Objects.Add(new StoredObject(
                tenantId, imageId, StoredObjectKind.Derived, writtenAt, 10, $"{tenantId}/derived/{imageId}_{variant}"));

        public bool Exists(Guid tenantId, Guid imageId) =>
            Objects.Any(o => o.TenantId == tenantId && o.ImageId == imageId);

        public Task<StoreDeletion> DeleteAsync(
            Guid tenantId,
            Guid imageId,
            string contentType,
            CancellationToken ct)
        {
            Deletes.Add((tenantId, imageId));
            var doomed = Objects.Where(o => o.TenantId == tenantId && o.ImageId == imageId).ToArray();
            foreach (var stored in doomed)
            {
                Objects.Remove(stored);
            }

            return Task.FromResult(new StoreDeletion(doomed.Length, doomed.Sum(o => o.SizeBytes)));
        }

        public async IAsyncEnumerable<StoredObject> EnumerateAsync(
            [EnumeratorCancellation] CancellationToken ct)
        {
            foreach (var stored in Objects.ToArray())
            {
                yield return stored;
            }

            await Task.CompletedTask;
        }

        public Task<bool> DeleteObjectAsync(StoredObject stored, CancellationToken ct) =>
            Task.FromResult(Objects.Remove(stored));

        public Task SaveAsync(
            Guid tenantId,
            Guid imageId,
            string contentType,
            ReadOnlyMemory<byte> data,
            CancellationToken ct) => throw new NotSupportedException();

        public Task<Stream?> OpenReadAsync(
            Guid tenantId,
            Guid imageId,
            string contentType,
            CancellationToken ct) => throw new NotSupportedException();

        public Task<byte[]?> ReadAllAsync(
            Guid tenantId,
            Guid imageId,
            string contentType,
            CancellationToken ct) => throw new NotSupportedException();

        public Task SaveDerivedAsync(
            Guid tenantId,
            Guid imageId,
            ImageVariant variant,
            string contentType,
            ReadOnlyMemory<byte> data,
            CancellationToken ct) => throw new NotSupportedException();

        public Task<Stream?> OpenDerivedAsync(
            Guid tenantId,
            Guid imageId,
            ImageVariant variant,
            string contentType,
            CancellationToken ct) => throw new NotSupportedException();
    }
}
