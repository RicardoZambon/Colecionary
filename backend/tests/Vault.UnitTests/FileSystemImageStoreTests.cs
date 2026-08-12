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

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }
}
