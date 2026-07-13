using Microsoft.AspNetCore.Mvc;
using Vault.Application.Store;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/store")]
public class StoreController(StoreService store) : ControllerBase
{
    [HttpGet("listings")]
    public Task<List<StoreListingDto>> Listings(CancellationToken ct) => store.ListAsync(ct);
}
