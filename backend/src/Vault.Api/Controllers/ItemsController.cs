using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vault.Api.Infrastructure;
using Vault.Application.Collections;
using Vault.Application.Collections.Dtos;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/collections/{collectionId}/items")]
public class ItemsController(CollectionService collections) : ControllerBase
{
    /// <summary>
    /// Creates or replaces one item. Requires the <b>collection's</b>
    /// <c>If-Match</c>, and answers with the version it moved to.
    /// </summary>
    /// <remarks>
    /// The precondition is collection-wide because there is nowhere to keep a
    /// per-item one: versions reach this client through the collection list, and
    /// an item token would have to ride inside <c>ItemDto</c> — which is also the
    /// archive's on-disk format. The alternative to a collection-wide check is no
    /// check, and no check means two people editing one item overwrite each other
    /// in silence.
    /// </remarks>
    [ProducesResponseType<ItemDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ItemDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status412PreconditionFailed)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status428PreconditionRequired)]
    [Authorize(Policy = VaultPolicies.CanWrite)]
    [HttpPut("{itemId}")]
    public async Task<ActionResult<ItemDto>> Upsert(
        string collectionId,
        string itemId,
        ItemDto dto,
        CancellationToken ct)
    {
        var (item, created) =
            await collections.UpsertItemAsync(collectionId, itemId, dto, IfMatch.Require(Request), ct);
        Response.Headers.ETag = item.Version;
        return created ? StatusCode(StatusCodes.Status201Created, item.Item) : Ok(item.Item);
    }

    /// <summary>
    /// Removes one item. Does not demand a precondition — but honours one that
    /// is offered — and answers with the version the collection moved to.
    /// </summary>
    /// <remarks>
    /// The <c>ETag</c> is not decoration. Deleting an item advances the whole
    /// aggregate's version — it has to, or a client that had not seen the delete
    /// could PUT the document back and resurrect it — so a caller left holding
    /// the old tag would be refused on its next save for a change it made itself.
    /// </remarks>
    [Authorize(Policy = VaultPolicies.CanWrite)]
    [HttpDelete("{itemId}")]
    public async Task<IActionResult> Delete(string collectionId, string itemId, CancellationToken ct)
    {
        Response.Headers.ETag =
            await collections.DeleteItemAsync(collectionId, itemId, IfMatch.Optional(Request), ct);
        return NoContent();
    }
}
