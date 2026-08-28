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
public sealed record ImportEntry(string Name, string? ExistingId);

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
/// Ids of live collections to overwrite. Overwriting is wholesale: the archived
/// document becomes the collection's entire contents. Nothing is merged, so an
/// item the archive doesn't have is an item the collection no longer has.
/// </param>
public sealed record ImportDecisions(bool Confirmed, IReadOnlySet<string> Replace)
{
    public static ImportDecisions None { get; } =
        new(false, new HashSet<string>(StringComparer.Ordinal));
}

/// <summary>
/// Either the import happened, or it needs an answer first — never both.
/// </summary>
public sealed record ImportOutcome(IReadOnlyList<CollectionDto>? Imported, ImportPlan? Conflicts);
