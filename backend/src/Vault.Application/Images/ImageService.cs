using Vault.Application.Abstractions;
using Vault.Application.Common;
using Vault.Domain.Entities;

namespace Vault.Application.Images;

public sealed record ImageUploadResponse(Guid Id);

public class ImageService(IImageRepository images, ICurrentTenant currentTenant, TimeProvider timeProvider)
{
    public const int MaxBytes = 5 * 1024 * 1024;

    private static readonly string[] AllowedContentTypes =
        ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

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

        if (!AllowedContentTypes.Contains(contentType, StringComparer.OrdinalIgnoreCase))
        {
            throw new DomainRuleException("Only JPEG, PNG, WebP, GIF or AVIF images are accepted.");
        }

        var image = new StoredImage
        {
            Id = Guid.NewGuid(),
            TenantId = currentTenant.TenantId,
            ContentType = contentType.ToLowerInvariant(),
            Data = data,
            CreatedAtUtc = timeProvider.GetUtcNow(),
        };
        images.Add(image);
        await images.SaveChangesAsync(ct);
        return new ImageUploadResponse(image.Id);
    }

    public async Task<StoredImage> GetAsync(Guid id, CancellationToken ct) =>
        await images.GetUnfilteredAsync(id, ct)
            ?? throw new NotFoundException($"Image '{id}' not found.");
}
