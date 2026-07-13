using System.Text.RegularExpressions;
using FluentValidation;
using Vault.Application.Collections.Dtos;

namespace Vault.Application.Collections.Validators;

public static partial class IdRules
{
    [GeneratedRegex("^[A-Za-z0-9_.:-]{1,64}$")]
    public static partial Regex PublicId();
}

public sealed class CreateCollectionRequestValidator : AbstractValidator<CreateCollectionRequest>
{
    public CreateCollectionRequestValidator()
    {
        RuleFor(r => r.Name).NotEmpty().MaximumLength(200);
        RuleFor(r => r.Description).NotNull().MaximumLength(2000);
    }
}

public sealed class GroupNodeDtoValidator : AbstractValidator<GroupNodeDto>
{
    public GroupNodeDtoValidator()
    {
        RuleFor(g => g.Id).NotEmpty().Matches(IdRules.PublicId());
        RuleFor(g => g.Name).NotEmpty().MaximumLength(200);
        RuleFor(g => g.ParentId).Matches(IdRules.PublicId()).When(g => g.ParentId is not null);
        RuleForEach(g => g.Fields).NotEmpty().MaximumLength(100);
    }
}

public sealed class ItemDtoValidator : AbstractValidator<ItemDto>
{
    public ItemDtoValidator()
    {
        RuleFor(i => i.Id).NotEmpty().Matches(IdRules.PublicId());
        RuleFor(i => i.Name).NotEmpty().MaximumLength(200);
        RuleFor(i => i.Description).NotNull().MaximumLength(4000);
        RuleFor(i => i.Condition).Must(c => c is "Mint" or "Good" or "Fair")
            .WithMessage("Condition must be Mint, Good or Fair.");
        RuleFor(i => i.Year).InclusiveBetween(0, 3000);
        RuleFor(i => i.Value).GreaterThanOrEqualTo(0);
        RuleFor(i => i.Price).GreaterThanOrEqualTo(0);
        RuleFor(i => i.GroupId).MaximumLength(64);
        RuleFor(i => i.Img).NotNull().MaximumLength(260);
        RuleForEach(i => i.Tags).NotEmpty().MaximumLength(50);
        RuleFor(i => i.PhotoIds).Must(p => p.Count <= 8)
            .WithMessage("An item can have at most 8 photos.");
        RuleForEach(i => i.Custom).ChildRules(custom =>
        {
            custom.RuleFor(c => c.Key).NotEmpty().MaximumLength(100);
            custom.RuleFor(c => c.Value).NotNull().MaximumLength(1000);
        });
    }
}

public sealed class MemberDtoValidator : AbstractValidator<MemberDto>
{
    public MemberDtoValidator()
    {
        RuleFor(m => m.Email).NotEmpty().EmailAddress().MaximumLength(320);
        RuleFor(m => m.Name).NotEmpty().MaximumLength(200);
        RuleFor(m => m.Initials).NotEmpty().MaximumLength(4);
        RuleFor(m => m.Role).Must(r => r is "Owner" or "Editor" or "Viewer")
            .WithMessage("Role must be Owner, Editor or Viewer.");
    }
}

public sealed class CollectionDtoValidator : AbstractValidator<CollectionDto>
{
    public CollectionDtoValidator(
        IValidator<GroupNodeDto> groupValidator,
        IValidator<ItemDto> itemValidator,
        IValidator<MemberDto> memberValidator)
    {
        RuleFor(c => c.Id).NotEmpty().Matches(IdRules.PublicId());
        RuleFor(c => c.Name).NotEmpty().MaximumLength(200);
        RuleFor(c => c.Description).NotNull().MaximumLength(2000);
        RuleForEach(c => c.Groups).SetValidator(groupValidator);
        RuleForEach(c => c.Items).SetValidator(itemValidator);
        RuleForEach(c => c.Members).SetValidator(memberValidator);
    }
}
