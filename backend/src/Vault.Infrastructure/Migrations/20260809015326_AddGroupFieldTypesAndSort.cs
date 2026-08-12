using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupFieldTypesAndSort : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // `Fields` keeps its column and its nvarchar(max) type but changes
            // shape: an EF primitive collection of strings becomes an owned JSON
            // document. The scaffolder only widens it to nullable — rewriting
            // the existing documents is on us, and has to happen here because
            // nothing regenerates them later.
            migrationBuilder.AlterColumn<string>(
                name: "Fields",
                table: "groups",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AddColumn<string>(
                name: "SortBy",
                table: "groups",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SortDirection",
                table: "groups",
                type: "nvarchar(4)",
                maxLength: 4,
                nullable: true);

            // ["Set no.","Language"] -> [{"Name":"Set no.","Type":"Text"}, ...].
            // Every pre-existing field was free text, so Text is the faithful
            // reading, and it matches GroupField's CLR default. FOR JSON PATH is
            // used instead of string concatenation because it escapes names for
            // us — field names are user-supplied and may contain quotes.
            // The property names must match GroupConfiguration's
            // HasJsonPropertyName, and the enum is stored as its string name.
            //
            // COALESCE is load-bearing: FOR JSON PATH over zero rows returns
            // NULL, so a group with no fields would otherwise have its column
            // nulled out instead of becoming an empty array.
            migrationBuilder.Sql(
                """
                UPDATE tgt
                SET tgt.Fields = COALESCE(
                (
                    SELECT j.value AS [Name], N'Text' AS [Type]
                    FROM OPENJSON(tgt.Fields) AS j
                    FOR JSON PATH
                ), N'[]')
                FROM groups AS tgt
                WHERE ISJSON(tgt.Fields) = 1;
                """);

            // Anything unparseable (or NULL) becomes an explicit empty array,
            // never NULL — same rule the wantlist rows follow in `copies`.
            migrationBuilder.Sql(
                "UPDATE groups SET Fields = N'[]' WHERE Fields IS NULL OR ISJSON(Fields) = 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Back to a flat array of names. Declared types are lost, which is
            // inherent to the old shape. STRING_ESCAPE re-escapes the names that
            // FOR JSON PATH escaped on the way in.
            migrationBuilder.Sql(
                """
                UPDATE tgt
                SET tgt.Fields = COALESCE(
                (
                    SELECT N'[' + STRING_AGG(
                        N'"' + STRING_ESCAPE(JSON_VALUE(j.value, '$.Name'), 'json') + N'"', N',') + N']'
                    FROM OPENJSON(tgt.Fields) AS j
                ), N'[]')
                FROM groups AS tgt
                WHERE ISJSON(tgt.Fields) = 1;
                """);

            migrationBuilder.Sql(
                "UPDATE groups SET Fields = N'[]' WHERE Fields IS NULL OR ISJSON(Fields) = 0;");

            migrationBuilder.DropColumn(
                name: "SortBy",
                table: "groups");

            migrationBuilder.DropColumn(
                name: "SortDirection",
                table: "groups");

            // No defaultValue: the original column had no DEFAULT constraint,
            // and the backfill above guarantees there is nothing left to
            // default. Tightening happens last, once every row is populated.
            migrationBuilder.AlterColumn<string>(
                name: "Fields",
                table: "groups",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);
        }
    }
}
