using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vault.Api.Infrastructure;
using Vault.Application.Collections.Dtos;
using Vault.Application.Common;
using Vault.Application.Import;
using Vault.Application.Resources;

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
    /// asks, then posts the same file again with <c>confirmed=true</c>, the ids
    /// it chose to overwrite, and the version each of those was at in the plan;
    /// anything it leaves out lands as a new collection. An archive with no name
    /// collisions imports on the first request, with no dialog.
    /// </para>
    /// <para>
    /// It answers <b>409</b> with a fresh plan a second time if any collection
    /// the caller chose to overwrite has moved on since the plan was drawn.
    /// Overwriting runs the same wholesale replace the collection PUT does, and
    /// the PUT is not allowed to write over a version it never saw either — the
    /// difference is only that here the remedy is to ask the user again, against
    /// what is actually in the vault.
    /// </para>
    /// </remarks>
    /// <param name="confirmed">The caller has seen the plan and is answering it.</param>
    /// <param name="replace">Ids of live collections to overwrite wholesale.</param>
    /// <param name="replaceVersion">
    /// The version each of those collections was at in the plan, in the same
    /// order — the precondition for the overwrite. Two parallel lists rather
    /// than one packed value: an id and an entity-tag both carry punctuation,
    /// and a separator between them is a parsing rule to get subtly wrong, while
    /// an unequal pair of lists is a mistake that is impossible to miss.
    /// </param>
    /// <param name="ct">Cancellation.</param>
    [Authorize(Policy = VaultPolicies.CanAdminister)]
    [HttpPost]
    [RequestSizeLimit(MaxArchiveBytes)]
    [ProducesResponseType<IReadOnlyList<VersionedCollectionDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ImportPlan>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Post(
        [FromQuery] bool confirmed,
        [FromQuery] string[]? replace,
        [FromQuery] string[]? replaceVersion,
        CancellationToken ct)
    {
        var decisions = ReadDecisions(confirmed, replace, replaceVersion);
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

    /// <summary>
    /// Pairs the two decision lists, refusing a request whose lists do not line
    /// up rather than guessing which id lost its version.
    /// </summary>
    private static ImportDecisions ReadDecisions(
        bool confirmed,
        string[]? replace,
        string[]? replaceVersion)
    {
        var ids = replace ?? [];
        var versions = replaceVersion ?? [];
        if (ids.Length != versions.Length)
        {
            throw new DomainRuleException(Messages.ReplaceDecisionsMalformed);
        }

        var decisions = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var i = 0; i < ids.Length; i++)
        {
            // A duplicated id with two different versions cannot both be true,
            // and picking one would be picking for the user.
            if (decisions.TryGetValue(ids[i], out var existing)
                && !string.Equals(existing, versions[i], StringComparison.Ordinal))
            {
                throw new DomainRuleException(Messages.ReplaceDecisionsMalformed);
            }

            decisions[ids[i]] = versions[i];
        }

        return new ImportDecisions(confirmed, decisions);
    }
}
