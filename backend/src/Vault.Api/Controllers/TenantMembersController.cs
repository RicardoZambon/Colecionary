using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vault.Application.Collections.Dtos;
using Vault.Application.Tenants;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/tenant/members")]
public class TenantMembersController(TenantMemberService members) : ControllerBase
{
    [HttpGet]
    public Task<List<MemberDto>> List(CancellationToken ct) => members.ListAsync(ct);

    [HttpPut]
    [Authorize(Roles = "Owner")]
    public Task<List<MemberDto>> Update(List<MemberDto> desired, CancellationToken ct) =>
        members.UpdateAsync(desired, ct);
}
