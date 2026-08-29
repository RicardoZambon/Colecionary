using Vault.Application.Abstractions;
using Vault.Domain.Enums;
using Vault.Infrastructure.Storage;

namespace Vault.UnitTests;

/// <summary>
/// Pins the on-disk layout. These assertions need no database or container, so
/// CI (which runs only the unit tests) catches a change to the path shape — the
/// thing that decides whether one tenant's bytes can sit beside another's.
/// </summary>
public sealed class FileSystemImageStoreTests : IDisposable
{
    private readonly string _root =
        Path.Combine(Path.GetTempPath(), $"vault-store-tests-{Guid.NewGuid():N}");

    [Fact]
    public async Task Save_WritesUnderTheTenantsOwnDirectory()
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        var image = Guid.NewGuid();

        await store.SaveAsync(tenant, image, "image/png", new byte[] { 1, 2, 3 }, default);

        var expected = Path.Combine(_root, tenant.ToString("D"), $"{image:D}.png");
        Assert.True(File.Exists(expected));
        Assert.Equal(new byte[] { 1, 2, 3 }, await File.ReadAllBytesAsync(expected));
    }

    [Fact]
    public async Task Save_KeepsTenantsApart_EvenForTheSameImageId()
    {
        var store = new FileSystemImageStore(_root);
        var imageId = Guid.NewGuid();
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();

        await store.SaveAsync(tenantA, imageId, "image/png", new byte[] { 0xA }, default);
        await store.SaveAsync(tenantB, imageId, "image/png", new byte[] { 0xB }, default);

        // Same id, different tenants: two files, neither overwriting the other.
        await using var fromA = await store.OpenReadAsync(tenantA, imageId, "image/png", default);
        await using var fromB = await store.OpenReadAsync(tenantB, imageId, "image/png", default);
        Assert.Equal(0xA, fromA!.ReadByte());
        Assert.Equal(0xB, fromB!.ReadByte());
    }

    [Fact]
    public async Task OpenRead_IsNullWhenTheBytesAreMissing()
    {
        var store = new FileSystemImageStore(_root);

        // A metadata row whose file is gone must read as absent, not throw —
        // the API turns this into a 404 rather than a 500.
        var missing = await store.OpenReadAsync(Guid.NewGuid(), Guid.NewGuid(), "image/png", default);
        Assert.Null(missing);
    }

    [Fact]
    public async Task Save_LeavesNoStagingFileBehind()
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        await store.SaveAsync(tenant, Guid.NewGuid(), "image/webp", new byte[] { 7 }, default);

        var files = Directory.GetFiles(Path.Combine(_root, tenant.ToString("D")));
        Assert.Single(files);
        Assert.EndsWith(".webp", files[0]);
    }

    [Theory]
    [InlineData("image/jpeg", ".jpg")]
    [InlineData("image/png", ".png")]
    [InlineData("image/webp", ".webp")]
    [InlineData("image/gif", ".gif")]
    [InlineData("image/avif", ".avif")]
    public async Task Save_NamesTheFileForItsContentType(string contentType, string extension)
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        var image = Guid.NewGuid();

        await store.SaveAsync(tenant, image, contentType, new byte[] { 1 }, default);

        Assert.True(File.Exists(Path.Combine(_root, tenant.ToString("D"), $"{image:D}{extension}")));
    }

    [Fact]
    public async Task Delete_RemovesTheOriginalAndEveryRendition()
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        var image = Guid.NewGuid();

        // A JPEG whose renditions are WebP — the case that catches a delete
        // which rebuilds variant names from the original's content type.
        await store.SaveAsync(tenant, image, "image/jpeg", new byte[] { 1, 2, 3 }, default);
        await store.SaveDerivedAsync(tenant, image, ImageVariant.Thumb, "image/webp", new byte[] { 4 }, default);
        await store.SaveDerivedAsync(tenant, image, ImageVariant.Display, "image/webp", new byte[] { 5, 6 }, default);

        var removed = await store.DeleteAsync(tenant, image, "image/jpeg", default);

        Assert.Equal(3, removed.Files);
        Assert.Equal(6, removed.Bytes);
        Assert.Empty(Directory.GetFiles(Path.Combine(_root, tenant.ToString("D"))));
        Assert.Empty(Directory.GetFiles(
            Path.Combine(_root, tenant.ToString("D"), FileSystemImageStore.DerivedDirectory)));
    }

    [Fact]
    public async Task Delete_TouchesNothingBelongingToAnyOtherImage()
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        var doomed = Guid.NewGuid();
        var neighbour = Guid.NewGuid();

        await store.SaveAsync(tenant, doomed, "image/png", new byte[] { 1 }, default);
        await store.SaveAsync(tenant, neighbour, "image/png", new byte[] { 2 }, default);
        await store.SaveDerivedAsync(tenant, neighbour, ImageVariant.Thumb, "image/webp", new byte[] { 3 }, default);

        await store.DeleteAsync(tenant, doomed, "image/png", default);

        Assert.NotNull(await store.OpenReadAsync(tenant, neighbour, "image/png", default));
        Assert.NotNull(await store.OpenDerivedAsync(tenant, neighbour, ImageVariant.Thumb, "image/webp", default));
    }

    [Fact]
    public async Task Delete_NeverReachesIntoAnotherTenantsDirectory()
    {
        var store = new FileSystemImageStore(_root);
        var imageId = Guid.NewGuid();
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();

        await store.SaveAsync(tenantA, imageId, "image/png", new byte[] { 0xA }, default);
        await store.SaveAsync(tenantB, imageId, "image/png", new byte[] { 0xB }, default);

        await store.DeleteAsync(tenantA, imageId, "image/png", default);

        Assert.Null(await store.OpenReadAsync(tenantA, imageId, "image/png", default));
        await using var survivor = await store.OpenReadAsync(tenantB, imageId, "image/png", default);
        Assert.Equal(0xB, survivor!.ReadByte());
    }

    [Fact]
    public async Task Delete_IsIdempotent()
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        var image = Guid.NewGuid();
        await store.SaveAsync(tenant, image, "image/png", new byte[] { 1 }, default);

        Assert.Equal(1, (await store.DeleteAsync(tenant, image, "image/png", default)).Files);
        Assert.Equal(0, (await store.DeleteAsync(tenant, image, "image/png", default)).Files);
        Assert.Equal(0, (await store.DeleteAsync(tenant, Guid.NewGuid(), "image/png", default)).Files);
    }

    [Fact]
    public async Task Enumerate_ClassifiesOriginals_RenditionsAndStagingResidue()
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        var image = Guid.NewGuid();

        await store.SaveAsync(tenant, image, "image/jpeg", new byte[] { 1 }, default);
        await store.SaveDerivedAsync(tenant, image, ImageVariant.Thumb, "image/webp", new byte[] { 2 }, default);
        // What a write that died between the temp file and the move leaves.
        await File.WriteAllBytesAsync(
            Path.Combine(_root, tenant.ToString("D"), $"{image:D}.jpg.{Guid.NewGuid():N}.tmp"),
            [3]);

        var found = await Collect(store);

        Assert.Equal(3, found.Count);
        Assert.All(found, o => Assert.Equal(tenant, o.TenantId));
        Assert.All(found, o => Assert.Equal(image, o.ImageId));
        Assert.Contains(found, o => o.Kind == StoredObjectKind.Original);
        Assert.Contains(found, o => o.Kind == StoredObjectKind.Derived);
        Assert.Contains(found, o => o.Kind == StoredObjectKind.Staging);
    }

    [Fact]
    public async Task Enumerate_SkipsAnythingItDoesNotRecognise()
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        await store.SaveAsync(tenant, Guid.NewGuid(), "image/png", new byte[] { 1 }, default);

        // A file the app did not write, and a directory that is not a tenant's.
        await File.WriteAllTextAsync(Path.Combine(_root, tenant.ToString("D"), "README.txt"), "hello");
        // Including one that merely shares the staging extension: the store only
        // ever writes "{imageId}....tmp", so anything else is somebody's file.
        await File.WriteAllTextAsync(
            Path.Combine(_root, tenant.ToString("D"), "pre-migration-dump.tmp"), "keep me");
        Directory.CreateDirectory(Path.Combine(_root, "not-a-tenant"));
        await File.WriteAllTextAsync(Path.Combine(_root, "not-a-tenant", "important.png"), "keep me");

        var found = await Collect(store);

        // Only ours. An unrecognised name is somebody else's file, and a sweep
        // must never be able to reach it.
        Assert.Single(found);
        Assert.True(File.Exists(Path.Combine(_root, tenant.ToString("D"), "README.txt")));
        Assert.True(File.Exists(Path.Combine(_root, tenant.ToString("D"), "pre-migration-dump.tmp")));
        Assert.True(File.Exists(Path.Combine(_root, "not-a-tenant", "important.png")));
    }

    [Fact]
    public async Task Enumerate_IsEmptyWhenTheRootDoesNotExist()
    {
        var store = new FileSystemImageStore(Path.Combine(_root, "missing"));
        Assert.Empty(await Collect(store));
    }

    [Fact]
    public async Task DeleteObject_RefusesAHandleOutsideTheStorageRoot()
    {
        var store = new FileSystemImageStore(_root);
        var outsider = Path.Combine(Path.GetTempPath(), $"vault-outsider-{Guid.NewGuid():N}");
        await File.WriteAllTextAsync(outsider, "not yours");

        try
        {
            var forged = new StoredObject(
                Guid.NewGuid(), Guid.NewGuid(), StoredObjectKind.Original,
                DateTimeOffset.UnixEpoch, 1, outsider);

            await Assert.ThrowsAsync<InvalidOperationException>(
                () => store.DeleteObjectAsync(forged, default));
            Assert.True(File.Exists(outsider));
        }
        finally
        {
            File.Delete(outsider);
        }
    }

    [Fact]
    public async Task DeleteObject_RemovesTheFileAndReportsAnAlreadyMissingOne()
    {
        var store = new FileSystemImageStore(_root);
        var tenant = Guid.NewGuid();
        await store.SaveAsync(tenant, Guid.NewGuid(), "image/png", new byte[] { 1 }, default);

        var stored = Assert.Single(await Collect(store));

        Assert.True(await store.DeleteObjectAsync(stored, default));
        Assert.False(await store.DeleteObjectAsync(stored, default));
    }

    private static async Task<List<StoredObject>> Collect(IImageStore store)
    {
        var found = new List<StoredObject>();
        await foreach (var stored in store.EnumerateAsync(default))
        {
            found.Add(stored);
        }

        return found;
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }
}
