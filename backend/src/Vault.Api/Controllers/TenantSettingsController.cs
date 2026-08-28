using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vault.Application.Tenants;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/tenant/settings")]
public class TenantSettingsController(TenantSettingsService settings) : ControllerBase
{
    // Readable by every member: the currency is how they read the vault, so a
    // Viewer who could not fetch it would see amounts under the wrong symbol.
    [HttpGet]
    public Task<TenantSettingsDto> Get(CancellationToken ct) => settings.GetAsync(ct);

    // Writable only by an Owner, like the member list — it changes what every
    // other member sees.
    [HttpPut]
    [Authorize(Roles = "Owner")]
    public Task<TenantSettingsDto> Update(TenantSettingsDto dto, CancellationToken ct) =>
        settings.UpdateAsync(dto, ct);
}
