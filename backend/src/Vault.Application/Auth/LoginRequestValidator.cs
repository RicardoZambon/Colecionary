using FluentValidation;

namespace Vault.Application.Auth;

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    /// <summary>Matches <c>User.Email</c>'s column width, and every other email rule in the app.</summary>
    public const int MaxEmailLength = 320;

    /// <summary>
    /// Far beyond any real passphrase, and short enough that hashing it is cheap.
    /// </summary>
    public const int MaxPasswordLength = 256;

    /// <remarks>
    /// The two length rules are not cosmetic. This was the only email rule in the
    /// app without one, and the default email check only insists on an interior
    /// <c>@</c> — so a 30 MB address passed validation, became the login
    /// throttle's dictionary key, and was retained for an hour. The password cap
    /// closes the matching CPU vector: PBKDF2 over a 30 MB input, on demand.
    /// </remarks>
    public LoginRequestValidator()
    {
        RuleFor(r => r.Email).NotEmpty().EmailAddress().MaximumLength(MaxEmailLength);
        RuleFor(r => r.Password).NotEmpty().MaximumLength(MaxPasswordLength);
    }
}
