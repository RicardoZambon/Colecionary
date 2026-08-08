using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddItemCopies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ORDER IS LOAD-BEARING: add -> backfill -> drop. The EF scaffolder
            // emits the drops first (it sorts drops before adds); that was
            // reordered by hand. With the original order the backfill would read
            // three columns that no longer exist and abort mid-transaction.
            migrationBuilder.AddColumn<string>(
                name: "copies",
                table: "items",
                type: "nvarchar(max)",
                nullable: true);

            // Owned items become exactly one copy carrying the old condition and
            // price. FOR JSON PATH is used instead of string concatenation: it
            // emits culture-invariant JSON numbers, escapes strings, and renders
            // date columns as yyyy-MM-dd -- byte-identical to what EF's
            // JsonDecimalReaderWriter / JsonDateOnlyReaderWriter produce.
            // The property names must match ItemConfiguration's HasJsonPropertyName.
            // The copy id mirrors SeedData's `{id}_c1` and stays inside
            // IdRules.PublicId(), so a migrated item survives a client GET → PUT.
            migrationBuilder.Sql(
                """
                UPDATE tgt
                SET tgt.copies =
                (
                    SELECT
                        LEFT(src.Id, 60) + '_c1'    AS [Id],
                        src.Condition               AS [Condition],
                        src.Price                   AS [Price],
                        CAST(NULL AS decimal(12,2)) AS [Value],
                        CAST(NULL AS date)          AS [AcquiredOn],
                        N'Keep'                     AS [Status],
                        N''                         AS [Notes]
                    FROM items AS src
                    WHERE src.TenantId     = tgt.TenantId
                      AND src.CollectionId = tgt.CollectionId
                      AND src.Id           = tgt.Id
                    FOR JSON PATH, INCLUDE_NULL_VALUES
                )
                FROM items AS tgt
                WHERE tgt.Owned = 1;
                """);

            // Wantlist rows: an explicit empty array, never NULL.
            migrationBuilder.Sql("UPDATE items SET copies = N'[]' WHERE Owned = 0;");

            // These are NOT NULL with no DEFAULT. Leaving them behind once the
            // entity stops mapping them would make every INSERT fail with error
            // 515, so dropping them here is required, not merely tidy.
            migrationBuilder.DropColumn(name: "Condition", table: "items");
            migrationBuilder.DropColumn(name: "Price", table: "items");
            migrationBuilder.DropColumn(name: "Owned", table: "items");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Added as nullable, backfilled, then tightened: AddColumn with
            // nullable:false would need a defaultValue and leave behind a DEFAULT
            // constraint the original schema never had. The first copy wins;
            // extra copies are lost, which is inherent to the old one-row-one-item
            // shape.
            migrationBuilder.AddColumn<string>(
                name: "Condition", table: "items",
                type: "nvarchar(8)", maxLength: 8, nullable: true);
            migrationBuilder.AddColumn<decimal>(
                name: "Price", table: "items",
                type: "decimal(12,2)", precision: 12, scale: 2, nullable: true);
            migrationBuilder.AddColumn<bool>(
                name: "Owned", table: "items", type: "bit", nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE items
                SET Owned = CASE
                        WHEN copies IS NOT NULL
                         AND ISJSON(copies) = 1
                         AND JSON_VALUE(copies, '$[0].Id') IS NOT NULL
                        THEN 1 ELSE 0 END,
                    Condition = COALESCE(JSON_VALUE(copies, '$[0].Condition'), N'Good'),
                    Price     = COALESCE(
                        TRY_CONVERT(decimal(12,2), JSON_VALUE(copies, '$[0].Price')), 0);
                """);

            migrationBuilder.AlterColumn<string>(
                name: "Condition", table: "items",
                type: "nvarchar(8)", maxLength: 8, nullable: false,
                oldClrType: typeof(string), oldType: "nvarchar(8)",
                oldMaxLength: 8, oldNullable: true);
            migrationBuilder.AlterColumn<decimal>(
                name: "Price", table: "items",
                type: "decimal(12,2)", precision: 12, scale: 2, nullable: false,
                oldClrType: typeof(decimal), oldType: "decimal(12,2)",
                oldPrecision: 12, oldScale: 2, oldNullable: true);
            migrationBuilder.AlterColumn<bool>(
                name: "Owned", table: "items", type: "bit", nullable: false,
                oldClrType: typeof(bool), oldType: "bit", oldNullable: true);

            migrationBuilder.DropColumn(name: "copies", table: "items");
        }
    }
}
