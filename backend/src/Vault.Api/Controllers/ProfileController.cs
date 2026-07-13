using Microsoft.AspNetCore.Mvc;
using Vault.Application.Profile;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/profile")]
public class ProfileController(ProfileService profile) : ControllerBase
{
    [HttpGet]
    public Task<UserProfileDto> Get(CancellationToken ct) => profile.GetAsync(ct);

    [HttpPut]
    public Task<UserProfileDto> Update(UserProfileDto dto, CancellationToken ct) =>
        profile.UpdateAsync(dto, ct);
}
