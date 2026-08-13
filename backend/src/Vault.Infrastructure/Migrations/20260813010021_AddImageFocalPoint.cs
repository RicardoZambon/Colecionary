using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddImageFocalPoint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "FocalX",
                schema: "Storage",
                table: "Images",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "FocalY",
                schema: "Storage",
                table: "Images",
                type: "float",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FocalX",
                schema: "Storage",
                table: "Images");

            migrationBuilder.DropColumn(
                name: "FocalY",
                schema: "Storage",
                table: "Images");
        }
    }
}
