namespace Vault.Infrastructure.Persistence;

/// <summary>
/// The database schemas the model is split across. Every entity is mapped with
/// an explicit schema and a PascalCase table name, so no object ever resolves
/// through the caller's default schema.
/// </summary>
/// <remarks>
/// Grouping is by concern, not by aggregate: <see cref="Identity"/> owns who
/// the tenant and its users are, <see cref="Catalog"/> owns the tenant-owned
/// collection graph, <see cref="Store"/> owns the global read-only catalog
/// tenants import from, and <see cref="Storage"/> owns binary blobs. The split
/// is what makes per-schema GRANTs possible — a reader role that needs the
/// store catalogue no longer has to be granted the whole database.
/// </remarks>
public static class VaultSchemas
{
    /// <summary>Tenants and their users.</summary>
    public const string Identity = "Identity";

    /// <summary>The tenant-owned collection graph: collections, groups, items, members.</summary>
    public const string Catalog = "Catalog";

    /// <summary>The global, tenant-agnostic store listings tenants import from.</summary>
    public const string Store = "Store";

    /// <summary>Uploaded binaries.</summary>
    public const string Storage = "Storage";
}
