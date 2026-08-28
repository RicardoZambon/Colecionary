using Microsoft.AspNetCore.Mvc;
using Vault.Application.Collections.Dtos;
using Vault.Application.Import;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/import")]
public class ImportController(ImportService import) : ControllerBase
{
    /// <summary>
    /// An upload ceiling for the archive as a whole. Individual photos are
    /// capped at <c>ImageService.MaxBytes</c> while reading, so this only has to
    /// be large enough for a real vault — a few thousand photos — and small
    /// enough that a bad request can't fill the disk.
    /// </summary>
    public const long MaxArchiveBytes = 2L * 1024 * 1024 * 1024;

    /// <summary>
    /// Restores collections from an archive produced by <c>/api/export</c>,
    /// photos included, and returns them as they were created.
    /// </summary>
    /// <remarks>
    /// Takes the zip as the raw request body rather than as a multipart form:
    /// the payload is one file with no fields beside it, and a raw body sidesteps
    /// the separate multipart length limit that would otherwise have to be raised
    /// in step with the request-size limit above.
    /// <para>
    /// The body is spooled to a temp file first. ZipArchive reads the central
    /// directory at the end of the stream and so needs to seek, which a request
    /// body cannot do; the temp file also keeps memory flat, mirroring what the
    /// export does in the opposite direction.
    /// </para>
    /// </remarks>
    [HttpPost]
    [RequestSizeLimit(MaxArchiveBytes)]
    public async Task<ActionResult<IReadOnlyList<CollectionDto>>> Post(CancellationToken ct)
    {
        var scratch = Path.Combine(Path.GetTempPath(), $"vault-import-{Guid.NewGuid():N}.zip");
        try
        {
            await using (var receiving = new FileStream(
                scratch,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 64 * 1024,
                useAsync: true))
            {
                await Request.Body.CopyToAsync(receiving, ct);
            }

            // Opened for synchronous reads on purpose: ZipArchive reads
            // synchronously, and this is a temp file, never the request body.
            await using var received = new FileStream(
                scratch, FileMode.Open, FileAccess.Read, FileShare.None);

            return Ok(await import.ImportAsync(received, ct));
        }
        finally
        {
            System.IO.File.Delete(scratch);
        }
    }
}
