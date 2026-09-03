using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <summary>
    /// One column, and deliberately no backfill.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Two of the three model changes need no DDL at all. A field's new
    /// <c>Scope</c> lives inside the JSON document that <c>Groups.Fields</c>
    /// already is, and a copy's <c>Custom</c> inside <c>Items.Copies</c>; a
    /// document written before either existed simply lacks the property, which
    /// EF materialises as the CLR default — <c>FieldScope.Item</c> and an empty
    /// list. Those defaults are exactly what those rows have always meant, so
    /// rewriting the documents to say so explicitly would touch every item in
    /// every vault to change nothing.
    /// </para>
    /// <para>
    /// <c>Collections.Fields</c> is nullable rather than defaulted to
    /// <c>'[]'</c> for the same reason: EF reads a null JSON collection column
    /// as an empty collection, and a DEFAULT would only apply to rows inserted
    /// after it, leaving the existing ones null anyway.
    /// </para>
    /// </remarks>
    public partial class AddFieldScopesAndCollectionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Fields",
                schema: "Catalog",
                table: "Collections",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Fields",
                schema: "Catalog",
                table: "Collections");
        }
    }
}
