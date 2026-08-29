using System.Text.RegularExpressions;
using FluentValidation;
using Vault.Application.Collections.Dtos;
using Vault.Application.Resources;
using Vault.Domain.ValueObjects;

namespace Vault.Application.Collections.Validators;

public static partial class IdRules
{
    [GeneratedRegex("^[A-Za-z0-9_.:-]{1,64}$")]
    public static partial Regex PublicId();
}

/// <summary>
/// Limits shared by everything that writes a collection.
/// </summary>
/// <remarks>
/// The name limit is a constant because the import has to respect it while
/// building a name of its own ("… (imported)"): a collection sitting exactly at
/// the limit must not become unsaveable purely by being imported, and a second
/// literal 200 in that code would drift the first time this one moved.
/// </remarks>
public static class CollectionRules
{
    public const int MaxNameLength = 200;
}

public sealed class CreateCollectionRequestValidator : AbstractValidator<CreateCollectionRequest>
{
    public CreateCollectionRequestValidator()
    {
        RuleFor(r => r.Name).NotEmpty().MaximumLength(CollectionRules.MaxNameLength);
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
            .WithMessage(_ => Messages.FieldNamesMustBeUnique);
        // A JSON column carries no per-field constraints of its own.
        RuleForEach(g => g.Fields).ChildRules(field =>
        {
            field.RuleFor(f => f.Name).NotEmpty().MaximumLength(100);
            field.RuleFor(f => f.Type).Must(t => t is "text" or "number" or "date")
                .WithMessage(_ => Messages.FieldTypeInvalid);
        });

        // Null is "no declared target". Zero is not a series, and null is
        // already the single way to say "unset". The upper bound is not a
        // domain truth, it is a plausibility guard: a mistyped paste must not
        // turn progress into a 0.000001% bar. A target BELOW the items already
        // catalogued is allowed on purpose — groups and items arrive in the
        // same document PUT, so cross-checking them would make declaring a
        // target before cataloguing (the main use case) unsaveable, and would
        // block the whole collection until the user deleted items. The overrun
        // is a display concern, not a 400.
        RuleFor(g => g.Target)
            .InclusiveBetween(1, 100_000)
            .When(g => g.Target.HasValue)
            .WithMessage(_ => Messages.TargetOutOfRange);

        When(g => g.Sort is not null, () =>
        {
            RuleFor(g => g.Sort!.Direction).Must(d => d is "asc" or "desc")
                .WithMessage(_ => Messages.SortDirectionInvalid);
            RuleFor(g => g.Sort!.By).Must(by => BuiltInSorts.Contains(by, StringComparer.Ordinal)
                    || (by.StartsWith(FieldPrefix, StringComparison.Ordinal)
                        && by.Length > FieldPrefix.Length
                        && by.Length <= FieldPrefix.Length + 100))
                .WithMessage(_ => Messages.SortKeyInvalid);
        });
    }
}

public sealed class SectionDtoValidator : AbstractValidator<SectionDto>
{
    public SectionDtoValidator()
    {
        RuleFor(s => s.Id).NotEmpty().Matches(IdRules.PublicId());
        // Required, unlike an item's GroupId: a section divides one group's
        // list, so a section belonging to nothing has nothing to divide. It is
        // still not checked against the groups in the payload — groups,
        // sections and items all arrive in the same document, so a reference
        // that dangles mid-edit is legal and resolves to "no section" on read.
        RuleFor(s => s.GroupId).NotEmpty().Matches(IdRules.PublicId());
        RuleFor(s => s.Name).NotEmpty().MaximumLength(200);
        // Same range and the same reasoning as a group's target, including
        // allowing one below what is already catalogued.
        RuleFor(s => s.Target)
            .InclusiveBetween(1, 100_000)
            .When(s => s.Target.HasValue)
            .WithMessage(_ => Messages.TargetOutOfRange);
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
        // A reference, not an id of its own: "" is "no section" and has to pass.
        RuleFor(i => i.SectionId).MaximumLength(64);
        RuleFor(i => i.Img).NotNull().MaximumLength(260);
        RuleForEach(i => i.Tags).NotEmpty().MaximumLength(50);
        RuleFor(i => i.PhotoIds).Must(p => p.Count <= 8)
            .WithMessage(_ => Messages.TooManyPhotos);
        RuleForEach(i => i.Custom).ChildRules(custom =>
        {
            custom.RuleFor(c => c.Key).NotEmpty().MaximumLength(100);
            custom.RuleFor(c => c.Value).NotNull().MaximumLength(1000);
        });
        // No copies at all is valid — that is the wantlist.
        RuleFor(i => i.Copies).Must(c => c.Count <= 50)
            .WithMessage(_ => Messages.TooManyCopies);
        // EF keys the JSON collection by ordinal, not by Id, so duplicates would
        // persist happily and only break the UI that edits copies by id.
        RuleFor(i => i.Copies)
            .Must(c => c.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() == c.Count)
            .WithMessage(_ => Messages.CopyIdsMustBeUnique);
        // Lengths and ranges are enforced here only: a JSON column carries no
        // per-field constraints of its own.
        RuleForEach(i => i.Copies).ChildRules(copy =>
        {
            copy.RuleFor(c => c.Id).NotEmpty().Matches(IdRules.PublicId());
            copy.RuleFor(c => c.Condition).Must(c => c is "Mint" or "Good" or "Fair")
                .WithMessage(_ => Messages.ConditionInvalid);
            copy.RuleFor(c => c.Status).Must(s => s is "Keep" or "ForTrade" or "ForSale")
                .WithMessage(_ => Messages.CopyStatusInvalid);
            copy.RuleFor(c => c.Price).GreaterThanOrEqualTo(0);
            copy.RuleFor(c => c.Value).GreaterThanOrEqualTo(0).When(c => c.Value.HasValue);
            copy.RuleFor(c => c.AcquiredOn).Must(d => d!.Value.Year is >= 1 and <= 3000)
                .When(c => c.AcquiredOn.HasValue)
                .WithMessage(_ => Messages.AcquiredOnImplausible);
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
            .WithMessage(_ => Messages.RoleInvalid);
    }
}

public sealed class CollectionDtoValidator : AbstractValidator<CollectionDto>
{
    public CollectionDtoValidator(
        IValidator<GroupNodeDto> groupValidator,
        IValidator<SectionDto> sectionValidator,
        IValidator<ItemDto> itemValidator,
        IValidator<MemberDto> memberValidator)
    {
        RuleFor(c => c.Id).NotEmpty().Matches(IdRules.PublicId());
        RuleFor(c => c.Name).NotEmpty().MaximumLength(CollectionRules.MaxNameLength);
        RuleFor(c => c.Description).NotNull().MaximumLength(2000);
        // Null is the override being absent, which is always valid; only a code
        // that is actually present has to be one the vault knows how to render.
        RuleFor(c => c.Currency)
            .Must(Money.IsSupported)
            .When(c => c.Currency is not null)
            .WithMessage(_ => Messages.CurrencyInvalid);
        RuleForEach(c => c.Groups).SetValidator(groupValidator);
        // The one place where a dangling reference IS refused, and the asymmetry
        // with sections and items is deliberate. Their references are allowed to
        // dangle because they degrade gracefully: an item pointing at a deleted
        // section simply reads as "no section", which is a legitimate
        // intermediate state of a full-document PUT. A ParentId has no graceful
        // reading. `childrenOf(groups, null)` walks down from the roots and never
        // reaches an orphaned or looped branch, so every group in it silently
        // disappears from the tree, from the sidebar and from the parent picker
        // — while its items go on counting in the collection's totals. There is
        // no screen on which the user could even see the damage, let alone undo
        // it, which is what makes this one worth a 400.
        RuleFor(c => c.Groups)
            .Must(NoDanglingParents).WithMessage(_ => Messages.GroupParentMustExist)
            .Must(NoParentCycles).WithMessage(_ => Messages.GroupParentCycle);
        // Ids have to be distinct here and not merely on the way in: the graph
        // merge keys its replacement list by id, so a duplicate would fail deep
        // inside persistence as a 500 instead of as the 400 it is.
        RuleFor(c => c.Sections)
            .Must(s => s.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() == s.Count)
            .WithMessage(_ => Messages.SectionIdsMustBeUnique);
        RuleForEach(c => c.Sections).SetValidator(sectionValidator);
        RuleForEach(c => c.Items).SetValidator(itemValidator);
        RuleForEach(c => c.Members).SetValidator(memberValidator);
    }

    /// <summary>A null ParentId is the root; anything else has to be in this document.</summary>
    private static bool NoDanglingParents(IReadOnlyList<GroupNodeDto> groups)
    {
        var ids = groups.Select(g => g.Id).ToHashSet(StringComparer.Ordinal);
        return groups.All(g => g.ParentId is null || ids.Contains(g.ParentId));
    }

    /// <summary>
    /// Walks each group's ancestor chain and refuses one that comes back round.
    /// Quadratic in the worst case, which a collection-scoped group tree can
    /// afford; the alternative is a graph colouring that reads far worse for a
    /// list whose length is measured in dozens.
    /// </summary>
    private static bool NoParentCycles(IReadOnlyList<GroupNodeDto> groups)
    {
        var parents = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var group in groups)
        {
            parents[group.Id] = group.ParentId;
        }

        foreach (var start in parents.Keys)
        {
            // Seeded with the starting id, so a group that is its own parent —
            // or its own grandparent — is caught by the same check.
            var seen = new HashSet<string>(StringComparer.Ordinal) { start };
            var current = parents[start];
            while (current is not null && parents.TryGetValue(current, out var next))
            {
                if (!seen.Add(current))
                {
                    return false;
                }

                current = next;
            }
        }

        return true;
    }
}
