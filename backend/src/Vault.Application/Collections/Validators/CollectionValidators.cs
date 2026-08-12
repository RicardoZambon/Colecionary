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
    /// <summary>Ordering keys the frontend knows how to apply.</summary>
    private static readonly string[] BuiltInSorts = ["manual", "added", "name", "value", "year"];

    private const string FieldPrefix = "field:";

    public GroupNodeDtoValidator()
    {
        RuleFor(g => g.Id).NotEmpty().Matches(IdRules.PublicId());
        RuleFor(g => g.Name).NotEmpty().MaximumLength(200);
        RuleFor(g => g.ParentId).Matches(IdRules.PublicId()).When(g => g.ParentId is not null);

        // Field names double as the keys in an item's `custom` list and as the
        // tail of a "field:<name>" sort key, so they have to stay unique.
        RuleFor(g => g.Fields)
            .Must(f => f.Select(x => x.Name).Distinct(StringComparer.Ordinal).Count() == f.Count)
            .WithMessage("Field names must be unique within a group.");
        // A JSON column carries no per-field constraints of its own.
        RuleForEach(g => g.Fields).ChildRules(field =>
        {
            field.RuleFor(f => f.Name).NotEmpty().MaximumLength(100);
            field.RuleFor(f => f.Type).Must(t => t is "text" or "number" or "date")
                .WithMessage("Field type must be text, number or date.");
        });

        When(g => g.Sort is not null, () =>
        {
            RuleFor(g => g.Sort!.Direction).Must(d => d is "asc" or "desc")
                .WithMessage("Sort direction must be asc or desc.");
            RuleFor(g => g.Sort!.By).Must(by => BuiltInSorts.Contains(by, StringComparer.Ordinal)
                    || (by.StartsWith(FieldPrefix, StringComparison.Ordinal)
                        && by.Length > FieldPrefix.Length
                        && by.Length <= FieldPrefix.Length + 100))
                .WithMessage("Sort key must be a built-in key or 'field:<field name>'.");
        });
    }
}

public sealed class ItemDtoValidator : AbstractValidator<ItemDto>
{
    public ItemDtoValidator()
    {
        RuleFor(i => i.Id).NotEmpty().Matches(IdRules.PublicId());
        RuleFor(i => i.Name).NotEmpty().MaximumLength(200);
        RuleFor(i => i.Description).NotNull().MaximumLength(4000);
        RuleFor(i => i.Year).InclusiveBetween(0, 3000);
        RuleFor(i => i.Value).GreaterThanOrEqualTo(0);
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
        // No copies at all is valid — that is the wantlist.
        RuleFor(i => i.Copies).Must(c => c.Count <= 50)
            .WithMessage("An item can have at most 50 copies.");
        // EF keys the JSON collection by ordinal, not by Id, so duplicates would
        // persist happily and only break the UI that edits copies by id.
        RuleFor(i => i.Copies)
            .Must(c => c.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() == c.Count)
            .WithMessage("Copy ids must be unique within an item.");
        // Lengths and ranges are enforced here only: a JSON column carries no
        // per-field constraints of its own.
        RuleForEach(i => i.Copies).ChildRules(copy =>
        {
            copy.RuleFor(c => c.Id).NotEmpty().Matches(IdRules.PublicId());
            copy.RuleFor(c => c.Condition).Must(c => c is "Mint" or "Good" or "Fair")
                .WithMessage("Condition must be Mint, Good or Fair.");
            copy.RuleFor(c => c.Status).Must(s => s is "Keep" or "ForTrade" or "ForSale")
                .WithMessage("Status must be Keep, ForTrade or ForSale.");
            copy.RuleFor(c => c.Price).GreaterThanOrEqualTo(0);
            copy.RuleFor(c => c.Value).GreaterThanOrEqualTo(0).When(c => c.Value.HasValue);
            copy.RuleFor(c => c.AcquiredOn).Must(d => d!.Value.Year is >= 1 and <= 3000)
                .When(c => c.AcquiredOn.HasValue)
                .WithMessage("AcquiredOn must be a plausible date.");
            copy.RuleFor(c => c.Notes).NotNull().MaximumLength(1000);
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
