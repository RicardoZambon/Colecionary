using Vault.Application.Images;
using Vault.Domain.Entities;

namespace Vault.UnitTests;

/// <summary>
/// Pins how a stored image's two nullable focal columns collapse into the one
/// nullable object the wire carries. Null is the load-bearing case: it means
/// "never framed", which every renderer turns into a centred crop.
/// </summary>
public class ImageFocalMappingTests
{
    private static StoredImage Image(double? x, double? y) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = Guid.NewGuid(),
        ContentType = "image/png",
        FocalX = x,
        FocalY = y,
    };

    [Fact]
    public void Focal_RoundTripsWhenBothAxesArePresent()
    {
        var meta = Image(0.25, 0.75).ToMeta();

        Assert.NotNull(meta.Focal);
        Assert.Equal(0.25, meta.Focal.X);
        Assert.Equal(0.75, meta.Focal.Y);
    }

    [Fact]
    public void UnframedImage_HasNoFocalAtAll()
    {
        Assert.Null(Image(null, null).ToMeta().Focal);
    }

    [Theory]
    [InlineData(0.4, null)]
    [InlineData(null, 0.4)]
    public void HalfWrittenFocal_DegradesToUnframed(double? x, double? y)
    {
        // An x with no y names no point on the picture. Reporting it as framed
        // would push the image to an edge the user never chose, so a partial
        // row has to read as "never framed" instead.
        Assert.Null(Image(x, y).ToMeta().Focal);
    }

    [Fact]
    public void Zero_IsAChoice_NotAMissingValue()
    {
        // 0 is a perfectly good focal point (the very top-left). It must not be
        // confused with null by anything treating the coordinates as falsy.
        var meta = Image(0, 0).ToMeta();

        Assert.NotNull(meta.Focal);
        Assert.Equal(0, meta.Focal.X);
        Assert.Equal(0, meta.Focal.Y);
    }
}
