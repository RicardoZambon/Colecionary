using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <summary>
    /// Drops the image blob column; the bytes now live in an IImageStore,
    /// partitioned by tenant.
    /// </summary>
    /// <remarks>
    /// The scaffolder's "may result in the loss of data" warning is real but
    /// handled: LegacyImageBlobExporter runs before Database.Migrate() and copies
    /// every blob to the store first. A migration cannot write files, which is
    /// why the export lives in startup rather than here — so this migration must
    /// never be applied by a bare `dotnet ef database update` against a database
    /// that still holds blobs. Start the API instead; it does both, in order.
    ///
    /// Down() restores the column but NOT the bytes, which by then are only on
    /// disk. Reverting is a schema rollback, not a data rollback.
    /// </remarks>
    public partial class MoveImageBytesToFileStorage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Data",
                schema: "Storage",
                table: "Images");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "Data",
                schema: "Storage",
                table: "Images",
                type: "varbinary(max)",
                nullable: false,
                defaultValue: new byte[0]);
        }
    }
}
