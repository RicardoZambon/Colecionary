using FluentValidation;
using Vault.Application.Resources;

namespace Vault.Application.Profile;

public sealed class UserProfileDtoValidator : AbstractValidator<UserProfileDto>
{
    public UserProfileDtoValidator()
    {
        RuleFor(p => p.Name).NotEmpty().MaximumLength(200);
        RuleFor(p => p.Email).NotEmpty().EmailAddress().MaximumLength(320);
        RuleFor(p => p.Initials).NotEmpty().MaximumLength(4);
        RuleFor(p => p.Plan).Must(p => p is "free" or "pro")
            .WithMessage(_ => Messages.PlanInvalid);
    }
}
