using System.Text.Json;

namespace Vault.Application.Archives;

/// <summary>
/// The entry names inside a Vault archive. Single source of truth: the export
/// writes them and the import reads them, so the two halves of a backup cannot
/// drift apart the way they would if each spelled the names itself.
/// </summary>
public static class ArchiveEntries
{
    public const string Manifest = "manifest.json";

    /// <summary>A whole vault: an array of collections.</summary>
    public const string Vault = "collections.json";

    /// <summary>A single collection: one object, not an array.</summary>
    public const string Collection = "collection.json";

    /// <summary>Image metadata — framing above all, which lives on no other entry.</summary>
    public const string Images = "images.json";

    public const string ImageDirectory = "images/";
}

/// <summary>
/// What an archive says about itself. Deliberately optional on read: archives
/// produced before this record existed carry no manifest, and the import can
/// still tell a vault from a collection by which JSON entry it finds. It is
/// written all the same, because "which app version wrote this, and when" is
/// exactly what you want when a restore goes wrong a year later.
/// </summary>
/// <param name="Format">Always <see cref="FormatName"/> — what this file is.</param>
/// <param name="Version">The archive layout's version, <see cref="CurrentVersion"/> today.</param>
/// <param name="Kind"><see cref="VaultKind"/> or <see cref="CollectionKind"/>.</param>
/// <param name="ExportedAt">When the archive was written, in UTC.</param>
public sealed record ArchiveManifest(
    string Format,
    int Version,
    string Kind,
    DateTimeOffset ExportedAt)
{
    public const string FormatName = "vault-archive";

    public const int CurrentVersion = 1;

    public const string VaultKind = "vault";

    public const string CollectionKind = "collection";
}

/// <summary>Why an archive cannot be read, or <see cref="Readable"/>.</summary>
public enum ArchiveReadability
{
    Readable,

    /// <summary>A zip of ours in shape, but not a Vault archive by its own claim.</summary>
    ForeignFormat,

    /// <summary>Written to a layout this build was never taught to read.</summary>
    FromANewerVersion,
}

/// <summary>
/// Whether this build can read an archive, decided from its manifest alone.
/// </summary>
/// <remarks>
/// <para>
/// The rule is one-directional: <b>older is readable, newer is not.</b> Every
/// entry a past version wrote is still an entry this one understands, and a
/// field it never wrote deserialises to the same default an absent field always
/// meant — so a v1 archive read by a v2 build is a restore, not a guess. The
/// reverse has no such guarantee: a newer layout may have moved, split or
/// re-scoped a field, and reading it under today's shapes would not fail, it
/// would <em>succeed quietly</em> and write nonsense into the vault. Refusing is
/// the only honest answer, and the message says which version wrote it so the
/// fix — update, then import — is obvious.
/// </para>
/// <para>
/// Which changes cost a version bump follows from that: adding an optional
/// field, or an entry old readers can ignore, does not — old archives stay
/// readable and old readers degrade to the default. Renaming a field, changing
/// what one means, or changing a unit does, because a reader that does not know
/// would silently misread it.
/// </para>
/// <para>
/// A missing manifest is not an error. Archives predating it exist, and their
/// layout is exactly what <see cref="ArchiveManifest.CurrentVersion"/> was when
/// they were written — v1, which this build reads natively.
/// </para>
/// </remarks>
public static class ArchiveCompatibility
{
    public static ArchiveReadability Check(ArchiveManifest? manifest)
    {
        if (manifest is null)
        {
            return ArchiveReadability.Readable;
        }

        // Only when it says something: a manifest with no format at all is one
        // of ours from before the field was populated, not a foreign file.
        if (!string.IsNullOrWhiteSpace(manifest.Format)
            && !string.Equals(manifest.Format, ArchiveManifest.FormatName, StringComparison.Ordinal))
        {
            return ArchiveReadability.ForeignFormat;
        }

        return manifest.Version > ArchiveManifest.CurrentVersion
            ? ArchiveReadability.FromANewerVersion
            : ArchiveReadability.Readable;
    }
}

/// <summary>
/// How archive JSON is written and read. Matches the API's own wire format
/// (camelCase, enums already strings in the DTOs), so an entry inside an archive
/// is byte-for-byte the shape a client sees from <c>GET /api/collections</c> —
/// which is what makes an archive inspectable, and hand-editable, without a tool.
/// </summary>
public static class ArchiveJson
{
    public static readonly JsonSerializerOptions Options =
        new(JsonSerializerDefaults.Web) { WriteIndented = true };
}
