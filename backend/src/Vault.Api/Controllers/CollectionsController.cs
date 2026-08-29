using Microsoft.AspNetCore.Mvc;
using Vault.Api.Infrastructure;
using Vault.Application.Collections;
using Vault.Application.Collections.Dtos;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/collections")]
public class CollectionsController(CollectionService collections) : ControllerBase
{
    /// <summary>
    /// Every collection, each wrapped with the version a write of it must quote
    /// back in <c>If-Match</c>.
    /// </summary>
    /// <remarks>
    /// The envelope is here and not an <c>ETag</c> header because one response
    /// carries many resources, and a header describes one. It is also the only
    /// correct moment to hand a version out: this is where the client
    /// synchronises, so this is the version its edits will have been derived
    /// from.
    /// </remarks>
    [HttpGet]
    public Task<List<VersionedCollectionDto>> List(CancellationToken ct) =>
        collections.ListVersionedAsync(ct);

    [HttpPost]
    public async Task<ActionResult<CollectionDto>> Create(CreateCollectionRequest request, CancellationToken ct)
    {
        var created = await collections.CreateAsync(request, ct);
        Response.Headers.ETag = created.Version;
        return CreatedAtAction(nameof(List), null, created.Collection);
    }

    /// <summary>Replaces the whole document. Requires <c>If-Match</c>.</summary>
    /// <remarks>
    /// Answers <b>428</b> with no precondition and <b>412</b> with a superseded
    /// one, and in both cases writes nothing at all. On success the <c>ETag</c>
    /// header carries the new version, so a client can keep editing without
    /// re-reading.
    /// </remarks>
    [ProducesResponseType<CollectionDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status412PreconditionFailed)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status428PreconditionRequired)]
    [HttpPut("{id}")]
    public async Task<CollectionDto> Update(string id, CollectionDto dto, CancellationToken ct)
    {
        var saved = await collections.UpdateAsync(id, dto, IfMatch.Require(Request), ct);
        Response.Headers.ETag = saved.Version;
        return saved.Collection;
    }

    /// <summary>Deletes a collection. Does not <em>demand</em> a precondition.</summary>
    /// <remarks>
    /// "Delete this collection" is not derived from the document the way a
    /// replace is: there is nothing in it that a stale reader could overwrite
    /// unknowingly, because all of it is going. Refusing a deliberate, confirmed
    /// destructive act because an unrelated item moved would cost the user a
    /// reload and buy nothing. An export made beforehand still restores the
    /// collection under the same id, which is the recovery path that does apply
    /// here. An <c>If-Match</c> the caller chooses to send is still honoured.
    /// </remarks>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await collections.DeleteAsync(id, IfMatch.Optional(Request), ct);
        return NoContent();
    }

    [HttpPost("import/{listingId}")]
    public async Task<ActionResult<CollectionDto>> ImportStoreListing(string listingId, CancellationToken ct)
    {
        var created = await collections.ImportStoreListingAsync(listingId, ct);
        Response.Headers.ETag = created.Version;
        return CreatedAtAction(nameof(List), null, created.Collection);
    }
}
