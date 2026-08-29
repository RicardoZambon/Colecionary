using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddImageUnreferencedSince : Migration
    {
        /// <inheritdoc />
        /// <remarks>
        /// Purely additive, and deliberately not backfilled. NULL is the correct
        /// value for every existing row: it means "believed referenced", so the
        /// first sweep re-derives the truth and starts each grace period from
        /// then rather than from a past this column was never keeping.
        /// </remarks>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UnreferencedSinceUtc",
                schema: "Storage",
                table: "Images",
                type: "datetimeoffset",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UnreferencedSinceUtc",
                schema: "Storage",
                table: "Images");
        }
    }
}
