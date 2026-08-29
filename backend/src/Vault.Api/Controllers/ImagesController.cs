using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vault.Api.Infrastructure;
using Vault.Application.Images;
using Vault.Application.Images.Dtos;
using Vault.Application.Resources;
using Vault.Domain.Enums;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/images")]
public class ImagesController(ImageService images) : ControllerBase
{
    [Authorize(Policy = VaultPolicies.CanWrite)]
    [HttpPost]
    [RequestSizeLimit(ImageService.MaxBytes + 1024 * 1024)]
    public async Task<ActionResult<ImageUploadResponse>> Upload(IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: Messages.NoFileUploaded);
        }

        using var stream = new MemoryStream();
        await file.CopyToAsync(stream, ct);
        var response = await images.UploadAsync(stream.ToArray(), file.ContentType, ct);
        return CreatedAtAction(nameof(Get), new { id = response.Id }, response);
    }

    /// <summary>
    /// Anonymous by design: &lt;img&gt; tags can't attach Authorization headers,
    /// so the unguessable GUID acts as the capability. Follow-up: signed URLs.
    /// </summary>
    /// <param name="id">The image's unguessable id.</param>
    /// <param name="size">
    /// Which rendition to serve. Defaults to <see cref="ImageVariant.Display"/>
    /// rather than to the original: every surface in the app wants a resized
    /// copy, and defaulting to the original would mean every caller that
    /// predates variants — including URLs already sitting in a user's cache —
    /// kept downloading full-size photos.
    /// </param>
    /// <param name="ct">Cancellation.</param>
    /// <remarks>
    /// The variant rides as a query parameter rather than a path segment so an
    /// id stays one canonical resource with renditions, and so the existing
    /// route keeps matching unchanged. `Vary` is not needed: the URL differs per
    /// variant, so caches key them apart on their own.
    /// </remarks>
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(
        Guid id,
        [FromQuery] ImageVariant size = ImageVariant.Display,
        CancellationToken ct = default)
    {
        var image = await images.OpenAsync(id, size, ct);
        // Still immutable: bytes for a given (id, size) never change — framing
        // is metadata applied at render time, and there is no re-upload path.
        Response.Headers.CacheControl = "private, max-age=86400, immutable";
        // File(Stream, ...) streams and disposes the handle — the bytes never
        // land in a buffer, which matters now that they come off disk.
        return File(image.Bytes, image.ContentType);
    }

    /// <summary>
    /// Metadata for the caller's own images. Authenticated — unlike the byte
    /// read, this enumerates, so it must never leave the tenant.
    /// </summary>
    /// <remarks>
    /// Doesn't collide with <see cref="Get"/>: that route's <c>:guid</c>
    /// constraint means "meta" can't match it.
    /// </remarks>
    [HttpGet("meta")]
    public async Task<ActionResult<IReadOnlyList<ImageMetaDto>>> ListMeta(CancellationToken ct) =>
        Ok(await images.ListMetadataAsync(ct));

    /// <summary>
    /// Sets which part of the image matters, so every surface crops around it.
    /// A null body focal resets to centred.
    /// </summary>
    /// <remarks>
    /// Authenticated and tenant-filtered, deliberately unlike the anonymous read
    /// above: holding a guessed id must not be enough to reframe someone else's
    /// picture. The bytes are untouched, so the id — and its cached URL — stay
    /// valid.
    /// </remarks>
    [Authorize(Policy = VaultPolicies.CanWrite)]
    [HttpPut("{id:guid}/focal")]
    public async Task<ActionResult<ImageMetaDto>> SetFocal(
        Guid id,
        [FromBody] SetFocalRequest request,
        CancellationToken ct) =>
        Ok(await images.SetFocalAsync(id, request.Focal, ct));
}
