using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Vault.Application.Common;

namespace Vault.Api.Infrastructure;

/// <summary>Maps application exceptions to RFC 7807 ProblemDetails responses.</summary>
public sealed class GlobalExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (status, title, detail) = exception switch
        {
            NotFoundException e => (StatusCodes.Status404NotFound, "Not found", e.Message),
            ConflictException e => (StatusCodes.Status409Conflict, "Conflict", e.Message),
            DomainRuleException e => (StatusCodes.Status400BadRequest, "Invalid operation", e.Message),
            ValidationException e => (
                StatusCodes.Status400BadRequest,
                "Validation failed",
                string.Join(" ", e.Errors.Select(f => f.ErrorMessage))),
            _ => (StatusCodes.Status500InternalServerError, "Something went wrong", (string?)null),
        };

        httpContext.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = status,
                Title = title,
                Detail = detail,
            },
        });
    }
}
