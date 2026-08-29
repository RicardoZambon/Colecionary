using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCollectionVersion : Migration
    {
        /// <inheritdoc />
        /// <remarks>
        /// The aggregate's optimistic-concurrency token. Purely additive, no
        /// backfill query needed: every existing collection starts at 1, the
        /// same value <c>Collection.Version</c>'s initializer gives a new one,
        /// so there is no row anywhere reading as "version zero". The number
        /// only ever has to be comparable to itself — nothing depends on where
        /// it started.
        /// </remarks>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Version",
                schema: "Catalog",
                table: "Collections",
                type: "int",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Version",
                schema: "Catalog",
                table: "Collections");
        }
    }
}
