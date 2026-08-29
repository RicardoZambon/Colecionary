using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Vault.Application.Common;
using Vault.Application.Resources;

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
            NotFoundException e => (StatusCodes.Status404NotFound, Messages.ProblemNotFound, e.Message),
            ConflictException e => (StatusCodes.Status409Conflict, Messages.ProblemConflict, e.Message),
            DomainRuleException e => (StatusCodes.Status400BadRequest, Messages.ProblemInvalidOperation, e.Message),
            // 412 and 428 both mean "your version of this document is not the
            // one that would be overwritten", and both leave storage untouched.
            // They are separate codes because the fixes differ: 428 says send a
            // precondition, 412 says send a current one.
            PreconditionFailedException e => (
                StatusCodes.Status412PreconditionFailed, Messages.ProblemPreconditionFailed, e.Message),
            PreconditionRequiredException e => (
                StatusCodes.Status428PreconditionRequired, Messages.ProblemPreconditionRequired, e.Message),
            ValidationException e => (
                StatusCodes.Status400BadRequest,
                Messages.ProblemValidationFailed,
                string.Join(" ", e.Errors.Select(f => f.ErrorMessage))),
            _ => (StatusCodes.Status500InternalServerError, Messages.ProblemUnexpected, (string?)null),
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
