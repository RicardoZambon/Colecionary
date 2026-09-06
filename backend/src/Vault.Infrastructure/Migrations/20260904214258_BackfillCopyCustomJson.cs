using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <summary>
    /// Writes <c>"Custom": []</c> into every copy of every stored
    /// <c>Items.Copies</c> document that does not already carry the key.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <see cref="AddFieldScopesAndCollectionFields"/> added no backfill, on the
    /// reasoning that an absent JSON property materialises as the CLR default.
    /// That is true of a <em>top-level</em> owned collection — a null
    /// <c>Collections.Fields</c> column reads back as an empty list — and it is
    /// <strong>false of a nested one</strong>: a copy is itself an owned entity
    /// inside the <c>Copies</c> document, and when its <c>Custom</c> array is
    /// missing EF throws a <c>NullReferenceException</c> while materialising the
    /// item. Every read of the collection graph then fails, so
    /// <c>GET /api/collections</c> answers 500 for the whole vault.
    /// </para>
    /// <para>
    /// It was invisible to the test suites because every row they write is
    /// written by the current code, which always emits the key. Only a vault
    /// that was already running had documents in the old shape.
    /// <c>LegacyRowCompatibilityTests</c> now puts those shapes back on purpose.
    /// </para>
    /// <para>
    /// The rewrite is guarded by an <c>EXISTS</c> so it touches only documents
    /// that need it and re-running it is a no-op. Order matters and is preserved
    /// explicitly: a copy's position in the array is the order the item form and
    /// the item page render them in, and <c>STRING_AGG</c> has no inherent
    /// ordering — the <c>[key]</c> of <c>OPENJSON</c> over an array is its index,
    /// cast to <c>int</c> so that 10 does not sort before 2.
    /// </para>
    /// </remarks>
    public partial class BackfillCopyCustomJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // JSON_QUERY(N'[]') writes a real empty array; passing the bare
            // string would store the two characters "[]" as a JSON *string*,
            // which is a shape EF cannot read either. CONVERT to nvarchar(max)
            // because STRING_AGG otherwise silently truncates at 8000.
            migrationBuilder.Sql(
                """
                UPDATE tgt
                SET tgt.Copies =
                (
                    SELECT N'[' + STRING_AGG(
                        CONVERT(nvarchar(max), JSON_MODIFY(j.value, '$.Custom', JSON_QUERY(N'[]'))),
                        N',') WITHIN GROUP (ORDER BY CONVERT(int, j.[key])) + N']'
                    FROM OPENJSON(tgt.Copies) AS j
                )
                FROM Catalog.Items AS tgt
                WHERE ISJSON(tgt.Copies) = 1
                  AND EXISTS (
                      SELECT 1
                      FROM OPENJSON(tgt.Copies) AS j
                      WHERE JSON_QUERY(j.value, '$.Custom') IS NULL);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drops the key again — JSON_MODIFY with a NULL value deletes the
            // property in lax mode. Any per-copy field values go with it, which
            // is inherent to the old shape: it has nowhere to put them.
            migrationBuilder.Sql(
                """
                UPDATE tgt
                SET tgt.Copies =
                (
                    SELECT N'[' + STRING_AGG(
                        CONVERT(nvarchar(max), JSON_MODIFY(j.value, '$.Custom', NULL)),
                        N',') WITHIN GROUP (ORDER BY CONVERT(int, j.[key])) + N']'
                    FROM OPENJSON(tgt.Copies) AS j
                )
                FROM Catalog.Items AS tgt
                WHERE ISJSON(tgt.Copies) = 1
                  AND EXISTS (
                      SELECT 1
                      FROM OPENJSON(tgt.Copies) AS j
                      WHERE JSON_QUERY(j.value, '$.Custom') IS NOT NULL);
                """);
        }
    }
}
