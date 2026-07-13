using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vault.Application.Auth;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AuthService auth, IValidator<LoginRequest> validator) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);
        var response = await auth.LoginAsync(request, ct);
        return response is null
            ? Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Invalid email or password")
            : Ok(response);
    }
}
