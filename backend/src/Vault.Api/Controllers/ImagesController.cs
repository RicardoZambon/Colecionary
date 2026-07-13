using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vault.Application.Images;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/images")]
public class ImagesController(ImageService images) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(ImageService.MaxBytes + 1024 * 1024)]
    public async Task<ActionResult<ImageUploadResponse>> Upload(IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "No file uploaded");
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
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var image = await images.GetAsync(id, ct);
        Response.Headers.CacheControl = "private, max-age=86400, immutable";
        return File(image.Data, image.ContentType);
    }
}
