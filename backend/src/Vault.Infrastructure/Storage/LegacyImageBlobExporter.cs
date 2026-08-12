using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Vault.Application.Abstractions;
using Vault.Infrastructure.Persistence;

namespace Vault.Infrastructure.Storage;

/// <summary>
/// Moves image bytes out of the database and onto the image store, once.
/// </summary>
/// <remarks>
/// <para>
/// Images used to live in a <c>varbinary(max)</c> column. The migration that
/// drops that column would take every existing image with it, and a migration
/// cannot write files — so this runs <b>before</b> <c>Database.Migrate()</c>,
/// copies each blob to the store, and lets the migration drop the now-redundant
/// column immediately after. One deployment, no data loss.
/// </para>
/// <para>
/// Everything here is guarded and idempotent: no database, no column, or no rows
/// all mean "nothing to do". It finds the table through <c>sys.columns</c> rather
/// than hard-coding a name, because a database old enough to still have the blob
/// column may also predate the schema rename — the table could be either
/// <c>dbo.images</c> or <c>Storage.Images</c> at this point.
/// </para>
/// </remarks>
public sealed class LegacyImageBlobExporter(
    VaultDbContext db,
    IImageStore store,
    ILogger<LegacyImageBlobExporter> logger)
{
    public async Task ExportAsync(CancellationToken ct = default)
    {
        if (!await db.Database.CanConnectAsync(ct))
        {
            return; // Fresh install: the schema is about to be created from scratch.
        }

        var table = await FindBlobTableAsync(ct);
        if (table is null)
        {
            return; // Already migrated, or a brand new schema.
        }

        var exported = 0;
        var connection = (SqlConnection)db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(ct);
        }

        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT [Id], [TenantId], [ContentType], [Data] FROM {table} WHERE [Data] IS NOT NULL";

        // SequentialAccess streams each blob instead of materialising the whole
        // row set — a few thousand 5 MB images must not become a few GB of heap.
        await using var reader = await command.ExecuteReaderAsync(
            System.Data.CommandBehavior.SequentialAccess, ct);

        while (await reader.ReadAsync(ct))
        {
            var id = reader.GetGuid(0);
            var tenantId = reader.GetGuid(1);
            var contentType = reader.GetString(2);

            using var blob = reader.GetStream(3);
            using var buffer = new MemoryStream();
            await blob.CopyToAsync(buffer, ct);

            await store.SaveAsync(tenantId, id, contentType, buffer.ToArray(), ct);
            exported++;
        }

        if (exported > 0)
        {
            logger.LogInformation(
                "Moved {Count} image(s) out of {Table} and onto the image store", exported, table);
        }
    }

    /// <summary>
    /// Bracket-quoted <c>schema.table</c> for the images table while it still has
    /// a <c>Data</c> column, or null once the migration has dropped it.
    /// </summary>
    private async Task<string?> FindBlobTableAsync(CancellationToken ct)
    {
        var connection = (SqlConnection)db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(ct);
        }

        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT TOP 1 s.name, t.name
            FROM sys.columns c
            JOIN sys.tables t ON t.object_id = c.object_id
            JOIN sys.schemas s ON s.schema_id = t.schema_id
            WHERE c.name = 'Data' AND t.name = 'Images'
            """;

        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        // Names come from sys, not from user input; escaping closing brackets
        // keeps the quoting honest regardless.
        var schema = reader.GetString(0).Replace("]", "]]");
        var name = reader.GetString(1).Replace("]", "]]");
        return $"[{schema}].[{name}]";
    }
}
