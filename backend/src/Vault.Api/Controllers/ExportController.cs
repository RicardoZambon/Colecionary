using Microsoft.AspNetCore.Mvc;
using Vault.Application.Export;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/export")]
public class ExportController(ExportService export) : ControllerBase
{
    /// <summary>
    /// Downloads the current tenant's collections plus their images as one zip.
    /// </summary>
    /// <remarks>
    /// The archive is built into a temp file and then streamed out, rather than
    /// written straight to the response. ZipArchive emits its central directory
    /// with a *synchronous* write on dispose, and Kestrel rejects synchronous
    /// writes to the response body — the alternative, AllowSynchronousIO, would
    /// block a request thread for the whole download. A temp file keeps memory
    /// flat however many photos the tenant has, and the copy back out is async.
    /// </remarks>
    [HttpGet]
    public async Task Get(CancellationToken ct)
    {
        var scratch = Path.Combine(Path.GetTempPath(), $"vault-export-{Guid.NewGuid():N}.zip");
        try
        {
            await using (var building = new FileStream(
                scratch, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await export.WriteArchiveAsync(building, ct);
            }

            await using var built = new FileStream(
                scratch,
                FileMode.Open,
                FileAccess.Read,
                FileShare.None,
                bufferSize: 64 * 1024,
                useAsync: true);

            Response.ContentType = "application/zip";
            Response.Headers.ContentDisposition = $"attachment; filename=\"{ExportService.FileName}\"";
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
