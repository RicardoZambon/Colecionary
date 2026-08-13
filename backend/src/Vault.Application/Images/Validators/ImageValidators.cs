using FluentValidation;
using Vault.Application.Images.Dtos;

namespace Vault.Application.Images.Validators;

/// <summary>
/// A focal point is a fraction of the image, so anything outside 0–1 names a
/// spot that isn't on the picture. Rejecting it here keeps the column honest:
/// every renderer multiplies these by 100 and trusts the result is a sane
/// percentage.
/// </summary>
public sealed class FocalPointDtoValidator : AbstractValidator<FocalPointDto>
{
    public FocalPointDtoValidator()
    {
        RuleFor(f => f.X).InclusiveBetween(0, 1);
        RuleFor(f => f.Y).InclusiveBetween(0, 1);
    }
}
