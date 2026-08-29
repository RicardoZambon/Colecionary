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
        // Ignored on write, but still shape-checked: the profile round-trips
        // through the client, and a value that cannot be a role means the client
        // sent something this server does not understand.
        RuleFor(p => p.Role).Must(r => r is "Owner" or "Editor" or "Viewer")
            .WithMessage(_ => Messages.RoleInvalid);
    }
}
