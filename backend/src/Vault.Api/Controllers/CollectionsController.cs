using Microsoft.AspNetCore.Mvc;
using Vault.Application.Collections;
using Vault.Application.Collections.Dtos;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/collections")]
public class CollectionsController(CollectionService collections) : ControllerBase
{
    [HttpGet]
    public Task<List<CollectionDto>> List(CancellationToken ct) => collections.ListAsync(ct);

    [HttpPost]
    public async Task<ActionResult<CollectionDto>> Create(CreateCollectionRequest request, CancellationToken ct)
    {
        var created = await collections.CreateAsync(request, ct);
        return CreatedAtAction(nameof(List), null, created);
    }

    [HttpPut("{id}")]
    public Task<CollectionDto> Update(string id, CollectionDto dto, CancellationToken ct) =>
        collections.UpdateAsync(id, dto, ct);

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        await collections.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("import/{listingId}")]
    public async Task<ActionResult<CollectionDto>> ImportStoreListing(string listingId, CancellationToken ct)
    {
        var created = await collections.ImportStoreListingAsync(listingId, ct);
        return CreatedAtAction(nameof(List), null, created);
    }
}
