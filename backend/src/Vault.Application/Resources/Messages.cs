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
        nameof(ProblemPreconditionRequired), nameof(ProblemPreconditionFailed),
        nameof(IfMatchRequired), nameof(CollectionChangedElsewhere),
        nameof(FieldNamesMustBeUnique), nameof(FieldTypeInvalid), nameof(TargetOutOfRange),
        nameof(SortDirectionInvalid), nameof(SortKeyInvalid), nameof(TooManyPhotos),
        nameof(TooManyCopies), nameof(CopyIdsMustBeUnique), nameof(ConditionInvalid),
        nameof(CopyStatusInvalid), nameof(AcquiredOnImplausible), nameof(RoleInvalid),
        nameof(PlanInvalid), nameof(CurrencyInvalid),
        nameof(CollectionNotFound), nameof(StoreListingNotFound), nameof(AlreadyInYourVault),
        nameof(ArchiveUnreadable), nameof(ArchiveHasNoCollections), nameof(ImportedCollectionName),
        nameof(ArchiveFromNewerVersion), nameof(ReplaceDecisionsMalformed),
        nameof(ImageFileEmpty), nameof(ImageTooLarge), nameof(ImageTypeUnsupported),
        nameof(ImageNotFound), nameof(ImageHasNoBytes), nameof(NoFileUploaded),
        nameof(TenantNeedsAnOwner), nameof(OwnerCannotBeRemoved), nameof(CannotRemoveYourself),
        nameof(CurrentUserNotFound), nameof(TenantNotFound), nameof(EmailCannotBeChanged),
        nameof(InvalidCredentials), nameof(TooManyLoginAttempts),
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
    public static string ProblemPreconditionRequired => Get(nameof(ProblemPreconditionRequired));
    public static string ProblemPreconditionFailed => Get(nameof(ProblemPreconditionFailed));

    // --- optimistic concurrency ---

    /// <summary>Detail of the 428 a write with no <c>If-Match</c> is refused with.</summary>
    public static string IfMatchRequired => Get(nameof(IfMatchRequired));

    /// <summary>
    /// Detail of the 412 a write built on a superseded version is refused with.
    /// Says plainly that nothing was saved: the client keeps the user's typed
    /// work on screen, and the message is what tells them it is still theirs.
    /// </summary>
    public static string CollectionChangedElsewhere => Get(nameof(CollectionChangedElsewhere));

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
    public static string CurrencyInvalid => Get(nameof(CurrencyInvalid));

    // --- collections ---
    /// <param name="id">Collection id.</param>
    public static string CollectionNotFoundFor(string id) => Format(nameof(CollectionNotFound), id);
    /// <param name="id">Store listing id.</param>
    public static string StoreListingNotFoundFor(string id) => Format(nameof(StoreListingNotFound), id);
    public static string CollectionNotFound => Get(nameof(CollectionNotFound));
    public static string StoreListingNotFound => Get(nameof(StoreListingNotFound));
    public static string AlreadyInYourVault => Get(nameof(AlreadyInYourVault));

    // --- import / export archives ---
    public static string ArchiveUnreadable => Get(nameof(ArchiveUnreadable));
    public static string ArchiveHasNoCollections => Get(nameof(ArchiveHasNoCollections));

    /// <summary>
    /// The overwrite decisions did not pair an id with a version. The client
    /// cannot recover by guessing, so the message says to start the import over.
    /// </summary>
    public static string ReplaceDecisionsMalformed => Get(nameof(ReplaceDecisionsMalformed));
    public static string ImportedCollectionName => Get(nameof(ImportedCollectionName));
    /// <param name="name">The collection's name in the archive.</param>
    public static string ImportedCollectionNameFor(string name) =>
        Format(nameof(ImportedCollectionName), name);

    public static string ArchiveFromNewerVersion => Get(nameof(ArchiveFromNewerVersion));

    /// <param name="version">The layout version the archive declares.</param>
    /// <param name="supported">The newest layout this build reads.</param>
    public static string ArchiveFromNewerVersionFor(int version, int supported) =>
        Format(nameof(ArchiveFromNewerVersion), version, supported);

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
    public static string TenantNotFound => Get(nameof(TenantNotFound));
    public static string EmailCannotBeChanged => Get(nameof(EmailCannotBeChanged));
    public static string InvalidCredentials => Get(nameof(InvalidCredentials));

    /// <summary>
    /// Title of the 429 the login throttle answers with. One message for both
    /// dimensions on purpose: naming the account as the throttled one would tell
    /// an attacker the address has an account here.
    /// </summary>
    public static string TooManyLoginAttempts => Get(nameof(TooManyLoginAttempts));

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

    /// <inheritdoc cref="Format(string, object)"/>
    private static string Format(string name, params object[] args) =>
        string.Format(CultureInfo.CurrentCulture, Get(name), args);
}
