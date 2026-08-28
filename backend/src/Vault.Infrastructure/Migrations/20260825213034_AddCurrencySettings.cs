using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCurrencySettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultCurrency",
                schema: "Identity",
                table: "Tenants",
                type: "nvarchar(3)",
                maxLength: 3,
                nullable: false,
                // Every tenant that predates this column is already reading its
                // amounts under "$" — the hardcoded symbol this feature
                // replaces. Backfilling USD keeps those vaults showing the same
                // number they showed yesterday; the scaffolded "" would have
                // left them with a currency no formatter accepts.
                defaultValue: "USD");

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                schema: "Catalog",
                table: "Collections",
                type: "nvarchar(3)",
                maxLength: 3,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultCurrency",
                schema: "Identity",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "Currency",
                schema: "Catalog",
                table: "Collections");
        }
    }
}
