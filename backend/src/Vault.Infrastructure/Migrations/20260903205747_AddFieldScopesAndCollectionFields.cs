using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <summary>
    /// One column, and no backfill — which was half right, and the wrong half
    /// shipped a 500. See <see cref="BackfillCopyCustomJson"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Two of the three model changes need no DDL. A field's new <c>Scope</c>
    /// lives inside the JSON document that <c>Groups.Fields</c> already is, and
    /// a copy's <c>Custom</c> inside <c>Items.Copies</c>.
    /// </para>
    /// <para>
    /// <b>The reasoning held for one of them and not the other.</b> An absent
    /// <c>Scope</c> does materialise as <c>FieldScope.Item</c>, because it is a
    /// scalar. An absent <c>Custom</c> does <em>not</em> materialise as an empty
    /// list: a copy is an owned entity nested inside the <c>Copies</c> document,
    /// and EF throws a <c>NullReferenceException</c> building the item, which
    /// fails every read of the collection graph. This migration is left as it
    /// was applied — <c>BackfillCopyCustomJson</c> writes the missing key, and
    /// <c>LegacyRowCompatibilityTests</c> is the test whose absence let this
    /// through.
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
