using System.Globalization;
using System.Resources;

namespace Vault.Application.Resources;

/// <summary>
/// User-facing API text, resolved against <see cref="CultureInfo.CurrentUICulture"/>
/// — which the API sets per request from <c>Accept-Language</c>. So a validation
/// failure or a ProblemDetails comes back in the language the client asked for.
/// </summary>
/// <remarks>
/// <para>
/// Hand-written rather than generated from the .resx: the strongly-typed
/// generator emits an <c>internal</c> class, and <c>Vault.Api</c> needs these
/// for ProblemDetails titles. <c>MessageResourceTests</c> pins every name here
/// to the neutral file <em>and</em> to the pt-BR satellite, which is stricter
/// than the generator ever was — it never checked translations existed.
/// </para>
/// <para>
/// <c>System.Resources</c> is BCL, so this does not give the Application layer a
/// dependency on ASP.NET. Only text a user reads belongs here; internal
/// invariants stay in English because they never surface as more than a 500.
/// </para>
/// </remarks>
public static class Messages
{
    private static readonly ResourceManager Resources =
        new("Vault.Application.Resources.Messages", typeof(Messages).Assembly);

    /// <summary>Every name this class exposes — the contract the resx files must satisfy.</summary>
    public static IReadOnlyList<string> Names { get; } =
    [
        nameof(ProblemNotFound), nameof(ProblemConflict), nameof(ProblemInvalidOperation),
        nameof(ProblemValidationFailed), nameof(ProblemUnexpected),
        nameof(FieldNamesMustBeUnique), nameof(FieldTypeInvalid), nameof(TargetOutOfRange),
        nameof(SortDirectionInvalid), nameof(SortKeyInvalid), nameof(TooManyPhotos),
        nameof(TooManyCopies), nameof(CopyIdsMustBeUnique), nameof(ConditionInvalid),
        nameof(CopyStatusInvalid), nameof(AcquiredOnImplausible), nameof(RoleInvalid),
        nameof(PlanInvalid),
        nameof(CollectionNotFound), nameof(StoreListingNotFound), nameof(AlreadyInYourVault),
        nameof(ImageFileEmpty), nameof(ImageTooLarge), nameof(ImageTypeUnsupported),
        nameof(ImageNotFound), nameof(ImageHasNoBytes), nameof(NoFileUploaded),
        nameof(TenantNeedsAnOwner), nameof(OwnerCannotBeRemoved), nameof(CannotRemoveYourself),
        nameof(CurrentUserNotFound), nameof(EmailCannotBeChanged), nameof(InvalidCredentials),
        nameof(UnknownGroupFieldType), nameof(UnknownCondition), nameof(UnknownCopyStatus),
        nameof(UnknownRole), nameof(UnknownPlan),
        nameof(SetupFieldsRequired), nameof(SetupPasswordTooShort), nameof(SetupDatabaseNotUsable),
    ];

    /// <summary>Looks a name up in an explicit culture. For tests and diagnostics.</summary>
    public static string? In(string name, CultureInfo culture) =>
        Resources.GetString(name, culture);

    private static string Get(string name) =>
        Resources.GetString(name, CultureInfo.CurrentUICulture) ?? name;

    // --- ProblemDetails titles ---
    public static string ProblemNotFound => Get(nameof(ProblemNotFound));
    public static string ProblemConflict => Get(nameof(ProblemConflict));
    public static string ProblemInvalidOperation => Get(nameof(ProblemInvalidOperation));
    public static string ProblemValidationFailed => Get(nameof(ProblemValidationFailed));
    public static string ProblemUnexpected => Get(nameof(ProblemUnexpected));

    // --- validation ---
    public static string FieldNamesMustBeUnique => Get(nameof(FieldNamesMustBeUnique));
    public static string FieldTypeInvalid => Get(nameof(FieldTypeInvalid));
    public static string TargetOutOfRange => Get(nameof(TargetOutOfRange));
    public static string SortDirectionInvalid => Get(nameof(SortDirectionInvalid));
    public static string SortKeyInvalid => Get(nameof(SortKeyInvalid));
    public static string TooManyPhotos => Get(nameof(TooManyPhotos));
    public static string TooManyCopies => Get(nameof(TooManyCopies));
    public static string CopyIdsMustBeUnique => Get(nameof(CopyIdsMustBeUnique));
    public static string ConditionInvalid => Get(nameof(ConditionInvalid));
    public static string CopyStatusInvalid => Get(nameof(CopyStatusInvalid));
    public static string AcquiredOnImplausible => Get(nameof(AcquiredOnImplausible));
    public static string RoleInvalid => Get(nameof(RoleInvalid));
    public static string PlanInvalid => Get(nameof(PlanInvalid));

    // --- collections ---
    /// <param name="id">Collection id.</param>
    public static string CollectionNotFoundFor(string id) => Format(nameof(CollectionNotFound), id);
    /// <param name="id">Store listing id.</param>
    public static string StoreListingNotFoundFor(string id) => Format(nameof(StoreListingNotFound), id);
    public static string CollectionNotFound => Get(nameof(CollectionNotFound));
    public static string StoreListingNotFound => Get(nameof(StoreListingNotFound));
    public static string AlreadyInYourVault => Get(nameof(AlreadyInYourVault));

    // --- images ---
    public static string ImageFileEmpty => Get(nameof(ImageFileEmpty));
    public static string ImageTooLarge => Get(nameof(ImageTooLarge));
    public static string ImageTypeUnsupported => Get(nameof(ImageTypeUnsupported));
    public static string ImageNotFound => Get(nameof(ImageNotFound));
    public static string ImageHasNoBytes => Get(nameof(ImageHasNoBytes));
    public static string NoFileUploaded => Get(nameof(NoFileUploaded));
    /// <param name="id">Image id.</param>
    public static string ImageNotFoundFor(Guid id) => Format(nameof(ImageNotFound), id);
    /// <param name="id">Image id.</param>
    public static string ImageHasNoBytesFor(Guid id) => Format(nameof(ImageHasNoBytes), id);

    // --- tenant members ---
    public static string TenantNeedsAnOwner => Get(nameof(TenantNeedsAnOwner));
    public static string OwnerCannotBeRemoved => Get(nameof(OwnerCannotBeRemoved));
    public static string CannotRemoveYourself => Get(nameof(CannotRemoveYourself));

    // --- profile / auth ---
    public static string CurrentUserNotFound => Get(nameof(CurrentUserNotFound));
    public static string EmailCannotBeChanged => Get(nameof(EmailCannotBeChanged));
    public static string InvalidCredentials => Get(nameof(InvalidCredentials));

    // --- mapping ---
    public static string UnknownGroupFieldType => Get(nameof(UnknownGroupFieldType));
    public static string UnknownCondition => Get(nameof(UnknownCondition));
    public static string UnknownCopyStatus => Get(nameof(UnknownCopyStatus));
    public static string UnknownRole => Get(nameof(UnknownRole));
    public static string UnknownPlan => Get(nameof(UnknownPlan));
    /// <param name="value">The value that was received.</param>
    public static string UnknownGroupFieldTypeFor(string value) => Format(nameof(UnknownGroupFieldType), value);
    /// <param name="value">The value that was received.</param>
    public static string UnknownConditionFor(string value) => Format(nameof(UnknownCondition), value);
    /// <param name="value">The value that was received.</param>
    public static string UnknownCopyStatusFor(string value) => Format(nameof(UnknownCopyStatus), value);
    /// <param name="value">The value that was received.</param>
    public static string UnknownRoleFor(string value) => Format(nameof(UnknownRole), value);
    /// <param name="value">The value that was received.</param>
    public static string UnknownPlanFor(string value) => Format(nameof(UnknownPlan), value);

    // --- first-run setup wizard ---
    public static string SetupFieldsRequired => Get(nameof(SetupFieldsRequired));
    public static string SetupPasswordTooShort => Get(nameof(SetupPasswordTooShort));
    public static string SetupDatabaseNotUsable => Get(nameof(SetupDatabaseNotUsable));
    /// <param name="probe">The <c>DatabaseConnectionResult</c> that came back.</param>
    public static string SetupDatabaseNotUsableFor(object probe) => Format(nameof(SetupDatabaseNotUsable), probe);

    /// <summary>
    /// Formats with <see cref="CultureInfo.CurrentCulture"/>, not the UI culture:
    /// the template comes from the UI culture, but any number or date spliced
    /// into it should read the way the request's own culture writes them.
    /// </summary>
    private static string Format(string name, object arg) =>
        string.Format(CultureInfo.CurrentCulture, Get(name), arg);
}
