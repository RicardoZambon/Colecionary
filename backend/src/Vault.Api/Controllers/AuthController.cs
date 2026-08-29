using System.Globalization;
using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Vault.Application.Auth;
using Vault.Application.Resources;

namespace Vault.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AuthService auth, IValidator<LoginRequest> validator) : ControllerBase
{
    /// <summary>
    /// Exchanges credentials for a token, or refuses.
    /// </summary>
    /// <remarks>
    /// The brute-force throttle is consulted inside the action rather than by a
    /// middleware ahead of the pipeline. What forces that is the account
    /// dimension: it needs the submitted email, which exists only after model
    /// binding, and throttling by address alone is the weak half of the defence.
    /// <para>
    /// The placement also settles the localization question, which any 429 has
    /// to answer. The title comes from <c>Messages</c>, so it is resolved
    /// against whatever <c>CurrentUICulture</c> is when it is read — and only
    /// code downstream of <c>UseRequestLocalization</c> is inside the culture
    /// that middleware set. An action is unconditionally downstream of it (the
    /// endpoint runs at the tail of the pipeline); a middleware registered ahead
    /// of it — the instinct, since shedding load early is cheaper — would answer
    /// in English however the client asked. <c>LoginThrottleTests</c> pins that.
    /// </para>
    /// </remarks>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);
        var result = await auth.LoginAsync(request, HttpContext.Connection.RemoteIpAddress?.ToString(), ct);

        switch (result.Outcome)
        {
            case LoginOutcome.Throttled:
                // Seconds, rounded up: Retry-After is a promise not to answer
                // sooner, so rounding down would invite an immediate retry.
                Response.Headers.RetryAfter = ((int)Math.Ceiling(result.RetryAfter.TotalSeconds))
                    .ToString(CultureInfo.InvariantCulture);
                return Problem(
                    statusCode: StatusCodes.Status429TooManyRequests,
                    title: Messages.TooManyLoginAttempts);

            case LoginOutcome.InvalidCredentials:
                return Problem(
                    statusCode: StatusCodes.Status401Unauthorized,
                    title: Messages.InvalidCredentials);

            default:
                return Ok(result.Response);
        }
    }
}
