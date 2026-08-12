using Vault.Application.Abstractions;
using Vault.Application.Common;
using Vault.Domain.Entities;

namespace Vault.Application.Images;

public sealed record ImageUploadResponse(Guid Id);

/// <summary>Open image bytes plus the content type to serve them as.</summary>
public sealed record ImageContent(string ContentType, Stream Bytes);

public class ImageService(
    IImageRepository images,
    IImageStore store,
    ICurrentTenant currentTenant,
    TimeProvider timeProvider)
{
    public const int MaxBytes = 5 * 1024 * 1024;

    public async Task<ImageUploadResponse> UploadAsync(byte[] data, string contentType, CancellationToken ct)
    {
        if (data.Length == 0)
        {
            throw new DomainRuleException("The uploaded file is empty.");
        }

        if (data.Length > MaxBytes)
        {
            throw new DomainRuleException("Images are limited to 5 MB.");
        }

        if (!ImageContentTypes.IsAllowed(contentType))
        {
            throw new DomainRuleException("Only JPEG, PNG, WebP, GIF or AVIF images are accepted.");
        }

        var image = new StoredImage
        {
            Id = Guid.NewGuid(),
            TenantId = currentTenant.TenantId,
            ContentType = contentType.ToLowerInvariant(),
            CreatedAtUtc = timeProvider.GetUtcNow(),
        };

        // Bytes first, then the row. The failure modes are not symmetric: a file
        // with no row is invisible garbage (the id is unreachable), while a row
        // with no file is a broken image in the UI. Orphaned files are the same
        // known gap as replaced images — collection is a documented follow-up.
        await store.SaveAsync(image.TenantId, image.Id, image.ContentType, data, ct);
        images.Add(image);
        await images.SaveChangesAsync(ct);
        return new ImageUploadResponse(image.Id);
    }

    /// <summary>
    /// Resolves an id to its bytes. The tenant comes from the image's own row,
    /// never from the ambient request, so a guessed id can only ever read inside
    /// the tenant that owns it.
    /// </summary>
    public async Task<ImageContent> OpenAsync(Guid id, CancellationToken ct)
    {
        var image = await images.GetUnfilteredAsync(id, ct)
            ?? throw new NotFoundException($"Image '{id}' not found.");

        var bytes = await store.OpenReadAsync(image.TenantId, image.Id, image.ContentType, ct)
            ?? throw new NotFoundException($"Image '{id}' has no stored bytes.");

        return new ImageContent(image.ContentType, bytes);
    }
}
