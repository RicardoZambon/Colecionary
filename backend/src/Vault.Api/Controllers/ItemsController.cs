using Microsoft.AspNetCore.Mvc;
using Vault.Application.Collections;
using Vault.Application.Collections.Dtos;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/collections/{collectionId}/items")]
public class ItemsController(CollectionService collections) : ControllerBase
{
    [HttpPut("{itemId}")]
    public async Task<ActionResult<ItemDto>> Upsert(
        string collectionId,
        string itemId,
        ItemDto dto,
        CancellationToken ct)
    {
        var (item, created) = await collections.UpsertItemAsync(collectionId, itemId, dto, ct);
        return created ? StatusCode(StatusCodes.Status201Created, item) : Ok(item);
    }

    [HttpDelete("{itemId}")]
    public async Task<IActionResult> Delete(string collectionId, string itemId, CancellationToken ct)
    {
        await collections.DeleteItemAsync(collectionId, itemId, ct);
        return NoContent();
    }
}
