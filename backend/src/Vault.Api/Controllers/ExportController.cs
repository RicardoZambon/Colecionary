using Microsoft.AspNetCore.Mvc;
using Vault.Application.Archives;
using Vault.Application.Export;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/export")]
public class ExportController(ExportService export) : ControllerBase
{
    /// <summary>
    /// Downloads the current tenant's collections plus their images as one zip.
    /// </summary>
    [HttpGet]
    public Task Get(CancellationToken ct) =>
        StreamArchiveAsync(
            async destination =>
            {
                await export.WriteVaultArchiveAsync(destination, ct);
                return ArchiveFileName.Vault;
            },
            ct);

    /// <summary>
    /// Downloads one collection and the images it uses — a backup of that
    /// collection alone, and the file <c>POST /api/import</c> reads back.
    /// </summary>
    [HttpGet("collections/{id}")]
    public Task GetCollection(string id, CancellationToken ct) =>
        StreamArchiveAsync(
            destination => export.WriteCollectionArchiveAsync(id, destination, ct),
            ct);

    /// <summary>
    /// Builds an archive into a temp file and then streams it out, rather than
    /// writing it straight to the response.
    /// </summary>
    /// <remarks>
    /// ZipArchive emits its central directory with a *synchronous* write on
    /// dispose, and Kestrel rejects synchronous writes to the response body —
    /// the alternative, AllowSynchronousIO, would block a request thread for the
    /// whole download. A temp file keeps memory flat however many photos the
    /// tenant has, and the copy back out is async.
    /// <para>
    /// <paramref name="build"/> returns the download's file name, because only
    /// the writer knows it: a collection archive is named after the collection,
    /// which it had to load anyway.
    /// </para>
    /// </remarks>
    private async Task StreamArchiveAsync(Func<Stream, Task<string>> build, CancellationToken ct)
    {
        var scratch = Path.Combine(Path.GetTempPath(), $"vault-export-{Guid.NewGuid():N}.zip");
        try
        {
            string fileName;
            await using (var building = new FileStream(
                scratch, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                fileName = await build(building);
            }

            await using var built = new FileStream(
                scratch,
                FileMode.Open,
                FileAccess.Read,
                FileShare.None,
                bufferSize: 64 * 1024,
                useAsync: true);

            Response.ContentType = "application/zip";
            Response.Headers.ContentDisposition = $"attachment; filename=\"{fileName}\"";
            // Known up front, so the browser can show real download progress.
            Response.ContentLength = built.Length;
            await built.CopyToAsync(Response.Body, ct);
        }
        finally
        {
            // Fully qualified: bare `File` binds to ControllerBase.File(...) here.
            System.IO.File.Delete(scratch);
        }
    }
}
