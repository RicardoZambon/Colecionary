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
    /// in step with the request-size limit above. The decisions ride in the query
    /// string for the same reason — they are a handful of ids, and mixing them
    /// into the body would mean parsing an envelope around a file.
    /// <para>
    /// The body is spooled to a temp file first. ZipArchive reads the central
    /// directory at the end of the stream and so needs to seek, which a request
    /// body cannot do; the temp file also keeps memory flat, mirroring what the
    /// export does in the opposite direction.
    /// </para>
    /// <para>
    /// Answers <b>409</b> with an <see cref="ImportPlan"/> when the archive holds
    /// a collection the vault already has by name: which one to overwrite is the
    /// user's call, never a default. Nothing is written in that case. The client
    /// asks, then posts the same file again with <c>confirmed=true</c> and the
    /// ids it chose to overwrite; anything it leaves out lands as a new
    /// collection. An archive with no name collisions imports on the first
    /// request, with no dialog.
    /// </para>
    /// </remarks>
    /// <param name="confirmed">The caller has seen the plan and is answering it.</param>
    /// <param name="replace">Ids of live collections to overwrite wholesale.</param>
    /// <param name="ct">Cancellation.</param>
    [HttpPost]
    [RequestSizeLimit(MaxArchiveBytes)]
    [ProducesResponseType<IReadOnlyList<CollectionDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ImportPlan>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Post(
        [FromQuery] bool confirmed,
        [FromQuery] string[]? replace,
        CancellationToken ct)
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

            var decisions = new ImportDecisions(
                confirmed,
                new HashSet<string>(replace ?? [], StringComparer.Ordinal));

            var outcome = await import.ImportAsync(received, decisions, ct);
            return outcome.Conflicts is { } conflicts
                ? Conflict(conflicts)
                : Ok(outcome.Imported);
        }
        finally
        {
            System.IO.File.Delete(scratch);
        }
    }
}
