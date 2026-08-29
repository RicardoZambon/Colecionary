using Vault.Application.Collections.Dtos;

namespace Vault.Application.Import;

/// <summary>
/// One collection inside an archive, and the collection already in the vault
/// that it would land on top of.
/// </summary>
/// <param name="Name">The name the archive carries.</param>
/// <param name="ExistingId">
/// The live collection sharing that name, or null when the name is free. It is
/// the id, not the name, that the client sends back to choose "overwrite" —
/// names are not unique and the user may rename between the two requests.
/// </param>
/// <param name="ExistingVersion">
/// That collection's version at the moment the plan was worked out, as an
/// entity-tag, or null when <paramref name="ExistingId"/> is. The client sends
/// it back with its answer, which is the only thing binding the plan the user
/// saw to the overwrite the server then performs: the two are separate requests
/// with a dialog and a second upload between them, and an overwrite runs the
/// same wholesale <c>ReplaceGraph</c> the collection PUT does.
/// </param>
public sealed record ImportEntry(string Name, string? ExistingId, string? ExistingVersion = null);

/// <summary>
/// What an archive would do to the vault, worked out before anything is
/// written. Returned to the client when a decision is needed, and never
/// persisted: the second request re-uploads and the plan is derived again, so
/// there is no half-finished import sitting on the server between the two.
/// </summary>
public sealed record ImportPlan(IReadOnlyList<ImportEntry> Entries)
{
    /// <summary>
    /// True when at least one archived collection already exists by name, which
    /// is the only case the user has to answer for. An archive of nothing but
    /// new collections imports on the first request, with no dialog at all.
    /// </summary>
    public bool NeedsConfirmation => Entries.Any(entry => entry.ExistingId is not null);
}

/// <summary>
/// What the caller decided, if anything.
/// </summary>
/// <param name="Confirmed">
/// The user has seen the plan. Without it a name collision stops the import and
/// asks; with it, silence about a collection means "create a new one", which is
/// why the flag is needed at all — an empty <paramref name="Replace"/> set is
/// otherwise indistinguishable from not having asked yet.
/// </param>
/// <param name="Replace">
/// Live collections to overwrite, each mapped to the version the caller saw in
/// the plan. Overwriting is wholesale: the archived document becomes the
/// collection's entire contents. Nothing is merged, so an item the archive
/// doesn't have is an item the collection no longer has — which is exactly why
/// the version is carried. An overwrite decided against a collection that has
/// since moved on is re-asked rather than performed.
/// </param>
public sealed record ImportDecisions(bool Confirmed, IReadOnlyDictionary<string, string> Replace)
{
    public static ImportDecisions None { get; } =
        new(false, new Dictionary<string, string>(StringComparer.Ordinal));

    /// <summary>
    /// Whether this decision still describes the vault the plan was read from.
    /// </summary>
    /// <remarks>
    /// False when any collection the caller chose to overwrite is no longer at
    /// the version the plan reported. The answer is then out of date and the
    /// user has to be asked again — against the document that is actually there.
    /// </remarks>
    public bool AgreesWith(ImportPlan plan) =>
        plan.Entries.All(entry =>
            entry.ExistingId is not { } id
            || !Replace.TryGetValue(id, out var expected)
            || string.Equals(expected, entry.ExistingVersion, StringComparison.Ordinal));
}

/// <summary>
/// Either the import happened, or it needs an answer first — never both.
/// </summary>
public sealed record ImportOutcome(IReadOnlyList<VersionedCollectionDto>? Imported, ImportPlan? Conflicts);
