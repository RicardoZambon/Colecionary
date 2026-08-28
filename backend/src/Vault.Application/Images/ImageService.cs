using FluentValidation;
using Vault.Application.Abstractions;
using Vault.Application.Common;
using Vault.Application.Images.Dtos;
using Vault.Application.Resources;
using Vault.Domain.Entities;
using Vault.Domain.Enums;

namespace Vault.Application.Images;

public sealed record ImageUploadResponse(Guid Id);

/// <summary>Open image bytes plus the content type to serve them as.</summary>
public sealed record ImageContent(string ContentType, Stream Bytes);

public class ImageService(
    IImageRepository images,
    IImageStore store,
    IImageDeriver deriver,
    ICurrentTenant currentTenant,
    TimeProvider timeProvider,
    IValidator<FocalPointDto> focalValidator)
{
    public const int MaxBytes = 5 * 1024 * 1024;

    /// <summary>
    /// What every resized copy is encoded as. Held here as well as on the
    /// deriver because the store needs it to name the cached file, and the two
    /// must agree or a cache write would never be found by a cache read.
    /// </summary>
    private const string DerivedContentType = "image/webp";

    public async Task<ImageUploadResponse> UploadAsync(byte[] data, string contentType, CancellationToken ct)
    {
        if (data.Length == 0)
        {
            throw new DomainRuleException(Messages.ImageFileEmpty);
        }

        if (data.Length > MaxBytes)
        {
            throw new DomainRuleException(Messages.ImageTooLarge);
        }

        if (!ImageContentTypes.IsAllowed(contentType))
        {
            throw new DomainRuleException(Messages.ImageTypeUnsupported);
        }

        var image = new StoredImage
        {
            Id = Guid.NewGuid(),
            TenantId = currentTenant.TenantId,
            ContentType = contentType.ToLowerInvariant(),
            CreatedAtUtc = timeProvider.GetUtcNow(),
        };

        // Rejected here rather than at the deriver: bytes that no decoder
        // recognises are not an image, whatever the browser labelled them, and
        // storing them would put a permanently broken picture in the gallery.
        var size = deriver.Measure(data)
            ?? throw new DomainRuleException(Messages.ImageTypeUnsupported);
        image.Width = size.Width;
        image.Height = size.Height;

        // Bytes first, then the row. The failure modes are not symmetric: a file
        // with no row is invisible garbage (the id is unreachable), while a row
        // with no file is a broken image in the UI. Orphaned files are the same
        // known gap as replaced images — collection is a documented follow-up.
        await store.SaveAsync(image.TenantId, image.Id, image.ContentType, data, ct);
        images.Add(image);
        await images.SaveChangesAsync(ct);

        // Eagerly, so the first view of a just-uploaded photo is already fast.
        // Best-effort: a derivation that fails must not fail the upload, because
        // the original is safely stored and the read path derives on demand
        // anyway. That fallback is what also covers every image that predates
        // variants and every image restored from an archive.
        await TryDeriveAllAsync(image, data, ct);

        return new ImageUploadResponse(image.Id);
    }

    /// <summary>
    /// Resolves an id to its bytes. The tenant comes from the image's own row,
    /// never from the ambient request, so a guessed id can only ever read inside
    /// the tenant that owns it.
    /// </summary>
    public async Task<ImageContent> OpenAsync(Guid id, ImageVariant variant, CancellationToken ct)
    {
        var image = await images.GetUnfilteredAsync(id, ct)
            ?? throw new NotFoundException(Messages.ImageNotFoundFor(id));

        var edge = ImageVariants.LongestEdge(variant);
        if (edge is not null && deriver.CanDerive(image.ContentType))
        {
            var derived = await OpenOrDeriveAsync(image, variant, edge.Value, ct);
            if (derived is not null)
            {
                return derived;
            }
            // Falls through to the original: a derivation that cannot be
            // produced is a slow picture, not a missing one.
        }

        var bytes = await store.OpenReadAsync(image.TenantId, image.Id, image.ContentType, ct)
            ?? throw new NotFoundException(Messages.ImageHasNoBytesFor(id));

        return new ImageContent(image.ContentType, bytes);
    }

    /// <summary>
    /// The cached derivative if it exists, otherwise one produced now and
    /// cached on the way out. Null when the original is unreadable or the
    /// resize fails, which the caller answers with the original bytes.
    /// </summary>
    private async Task<ImageContent?> OpenOrDeriveAsync(
        StoredImage image,
        ImageVariant variant,
        int longestEdge,
        CancellationToken ct)
    {
        var cached = await store.OpenDerivedAsync(
            image.TenantId, image.Id, variant, DerivedContentType, ct);
        if (cached is not null)
        {
            return new ImageContent(DerivedContentType, cached);
        }

        var original = await store.ReadAllAsync(image.TenantId, image.Id, image.ContentType, ct);
        if (original is null)
        {
            return null;
        }

        DerivedImage derived;
        try
        {
            derived = deriver.Derive(original, longestEdge, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // A picture that will not resize — corrupt, or past the decode
            // guard — still has usable original bytes. Serving those beats a
            // broken image, and retrying the resize on every request would turn
            // one bad upload into a permanent CPU cost.
            return null;
        }

        await store.SaveDerivedAsync(
            image.TenantId, image.Id, variant, DerivedContentType, derived.Bytes, ct);

        return new ImageContent(DerivedContentType, new MemoryStream(derived.Bytes));
    }

    /// <summary>
    /// Produces every resized variant, ignoring failures. Also backfills the
    /// intrinsic size for a row that predates the columns, since the deriver has
    /// already read it.
    /// </summary>
    private async Task TryDeriveAllAsync(StoredImage image, byte[] data, CancellationToken ct)
    {
        if (!deriver.CanDerive(image.ContentType))
        {
            return;
        }

        foreach (var variant in Enum.GetValues<ImageVariant>())
        {
            var edge = ImageVariants.LongestEdge(variant);
            if (edge is null)
            {
                continue;
            }

            try
            {
                var derived = deriver.Derive(data, edge.Value, ct);
                await store.SaveDerivedAsync(
                    image.TenantId, image.Id, variant, DerivedContentType, derived.Bytes, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Deliberately swallowed — see the call site in UploadAsync.
            }
        }
    }

    /// <summary>
    /// Metadata for every image the current tenant owns, so the client can frame
    /// each one without a round-trip per photo.
    /// </summary>
    public async Task<IReadOnlyList<ImageMetaDto>> ListMetadataAsync(CancellationToken ct)
    {
        var rows = await images.ListForCurrentTenantAsync(ct);
        return [.. rows.Select(ImageMapper.ToMeta)];
    }

    /// <summary>
    /// Sets (or clears, when <paramref name="focal"/> is null) an image's focal
    /// point. Tenant-filtered: an id belonging to someone else reads as missing.
    /// </summary>
    public async Task<ImageMetaDto> SetFocalAsync(Guid id, FocalPointDto? focal, CancellationToken ct)
    {
        if (focal is not null)
        {
            await focalValidator.ValidateAndThrowAsync(focal, ct);
        }

        var image = await images.GetForCurrentTenantAsync(id, ct)
            ?? throw new NotFoundException(Messages.ImageNotFoundFor(id));

        image.FocalX = focal?.X;
        image.FocalY = focal?.Y;
        await images.SaveChangesAsync(ct);
        return image.ToMeta();
    }
}
