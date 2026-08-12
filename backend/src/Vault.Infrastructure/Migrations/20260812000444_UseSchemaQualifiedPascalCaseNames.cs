using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Vault.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UseSchemaQualifiedPascalCaseNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_collection_members_collections_TenantId_CollectionId",
                table: "collection_members");

            migrationBuilder.DropForeignKey(
                name: "FK_collections_tenants_TenantId",
                table: "collections");

            migrationBuilder.DropForeignKey(
                name: "FK_groups_collections_TenantId_CollectionId",
                table: "groups");

            migrationBuilder.DropForeignKey(
                name: "FK_images_tenants_TenantId",
                table: "images");

            migrationBuilder.DropForeignKey(
                name: "FK_items_collections_TenantId_CollectionId",
                table: "items");

            migrationBuilder.DropForeignKey(
                name: "FK_users_tenants_TenantId",
                table: "users");

            migrationBuilder.DropPrimaryKey(
                name: "PK_users",
                table: "users");

            migrationBuilder.DropPrimaryKey(
                name: "PK_tenants",
                table: "tenants");

            migrationBuilder.DropPrimaryKey(
                name: "PK_items",
                table: "items");

            migrationBuilder.DropPrimaryKey(
                name: "PK_images",
                table: "images");

            migrationBuilder.DropPrimaryKey(
                name: "PK_groups",
                table: "groups");

            migrationBuilder.DropPrimaryKey(
                name: "PK_collections",
                table: "collections");

            migrationBuilder.DropPrimaryKey(
                name: "PK_store_listings",
                table: "store_listings");

            migrationBuilder.DropPrimaryKey(
                name: "PK_collection_members",
                table: "collection_members");

            migrationBuilder.EnsureSchema(
                name: "Catalog");

            migrationBuilder.EnsureSchema(
                name: "Storage");

            migrationBuilder.EnsureSchema(
                name: "Store");

            migrationBuilder.EnsureSchema(
                name: "Identity");

            migrationBuilder.RenameTable(
                name: "users",
                newName: "Users",
                newSchema: "Identity");

            migrationBuilder.RenameTable(
                name: "tenants",
                newName: "Tenants",
                newSchema: "Identity");

            migrationBuilder.RenameTable(
                name: "items",
                newName: "Items",
                newSchema: "Catalog");

            migrationBuilder.RenameTable(
                name: "images",
                newName: "Images",
                newSchema: "Storage");

            migrationBuilder.RenameTable(
                name: "groups",
                newName: "Groups",
                newSchema: "Catalog");

            migrationBuilder.RenameTable(
                name: "collections",
                newName: "Collections",
                newSchema: "Catalog");

            migrationBuilder.RenameTable(
                name: "store_listings",
                newName: "StoreListings",
                newSchema: "Store");

            migrationBuilder.RenameTable(
                name: "collection_members",
                newName: "CollectionMembers",
                newSchema: "Catalog");

            migrationBuilder.RenameIndex(
                name: "IX_users_TenantId_Email",
                schema: "Identity",
                table: "Users",
                newName: "IX_Users_TenantId_Email");

            migrationBuilder.RenameIndex(
                name: "IX_tenants_Slug",
                schema: "Identity",
                table: "Tenants",
                newName: "IX_Tenants_Slug");

            migrationBuilder.RenameColumn(
                name: "custom",
                schema: "Catalog",
                table: "Items",
                newName: "Custom");

            migrationBuilder.RenameColumn(
                name: "copies",
                schema: "Catalog",
                table: "Items",
                newName: "Copies");

            migrationBuilder.RenameIndex(
                name: "IX_images_TenantId",
                schema: "Storage",
                table: "Images",
                newName: "IX_Images_TenantId");

            migrationBuilder.RenameColumn(
                name: "items",
                schema: "Store",
                table: "StoreListings",
                newName: "Items");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Users",
                schema: "Identity",
                table: "Users",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Tenants",
                schema: "Identity",
                table: "Tenants",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Items",
                schema: "Catalog",
                table: "Items",
                columns: new[] { "TenantId", "CollectionId", "Id" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_Images",
                schema: "Storage",
                table: "Images",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Groups",
                schema: "Catalog",
                table: "Groups",
                columns: new[] { "TenantId", "CollectionId", "Id" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_Collections",
                schema: "Catalog",
                table: "Collections",
                columns: new[] { "TenantId", "Id" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_StoreListings",
                schema: "Store",
                table: "StoreListings",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_CollectionMembers",
                schema: "Catalog",
                table: "CollectionMembers",
                columns: new[] { "TenantId", "CollectionId", "Email" });

            migrationBuilder.AddForeignKey(
                name: "FK_CollectionMembers_Collections_TenantId_CollectionId",
                schema: "Catalog",
                table: "CollectionMembers",
                columns: new[] { "TenantId", "CollectionId" },
                principalSchema: "Catalog",
                principalTable: "Collections",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Collections_Tenants_TenantId",
                schema: "Catalog",
                table: "Collections",
                column: "TenantId",
                principalSchema: "Identity",
                principalTable: "Tenants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Groups_Collections_TenantId_CollectionId",
                schema: "Catalog",
                table: "Groups",
                columns: new[] { "TenantId", "CollectionId" },
                principalSchema: "Catalog",
                principalTable: "Collections",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Images_Tenants_TenantId",
                schema: "Storage",
                table: "Images",
                column: "TenantId",
                principalSchema: "Identity",
                principalTable: "Tenants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Items_Collections_TenantId_CollectionId",
                schema: "Catalog",
                table: "Items",
                columns: new[] { "TenantId", "CollectionId" },
                principalSchema: "Catalog",
                principalTable: "Collections",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Tenants_TenantId",
                schema: "Identity",
                table: "Users",
                column: "TenantId",
                principalSchema: "Identity",
                principalTable: "Tenants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CollectionMembers_Collections_TenantId_CollectionId",
                schema: "Catalog",
                table: "CollectionMembers");

            migrationBuilder.DropForeignKey(
                name: "FK_Collections_Tenants_TenantId",
                schema: "Catalog",
                table: "Collections");

            migrationBuilder.DropForeignKey(
                name: "FK_Groups_Collections_TenantId_CollectionId",
                schema: "Catalog",
                table: "Groups");

            migrationBuilder.DropForeignKey(
                name: "FK_Images_Tenants_TenantId",
                schema: "Storage",
                table: "Images");

            migrationBuilder.DropForeignKey(
                name: "FK_Items_Collections_TenantId_CollectionId",
                schema: "Catalog",
                table: "Items");

            migrationBuilder.DropForeignKey(
                name: "FK_Users_Tenants_TenantId",
                schema: "Identity",
                table: "Users");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Users",
                schema: "Identity",
                table: "Users");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Tenants",
                schema: "Identity",
                table: "Tenants");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Items",
                schema: "Catalog",
                table: "Items");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Images",
                schema: "Storage",
                table: "Images");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Groups",
                schema: "Catalog",
                table: "Groups");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Collections",
                schema: "Catalog",
                table: "Collections");

            migrationBuilder.DropPrimaryKey(
                name: "PK_StoreListings",
                schema: "Store",
                table: "StoreListings");

            migrationBuilder.DropPrimaryKey(
                name: "PK_CollectionMembers",
                schema: "Catalog",
                table: "CollectionMembers");

            migrationBuilder.RenameTable(
                name: "Users",
                schema: "Identity",
                newName: "users");

            migrationBuilder.RenameTable(
                name: "Tenants",
                schema: "Identity",
                newName: "tenants");

            migrationBuilder.RenameTable(
                name: "Items",
                schema: "Catalog",
                newName: "items");

            migrationBuilder.RenameTable(
                name: "Images",
                schema: "Storage",
                newName: "images");

            migrationBuilder.RenameTable(
                name: "Groups",
                schema: "Catalog",
                newName: "groups");

            migrationBuilder.RenameTable(
                name: "Collections",
                schema: "Catalog",
                newName: "collections");

            migrationBuilder.RenameTable(
                name: "StoreListings",
                schema: "Store",
                newName: "store_listings");

            migrationBuilder.RenameTable(
                name: "CollectionMembers",
                schema: "Catalog",
                newName: "collection_members");

            migrationBuilder.RenameIndex(
                name: "IX_Users_TenantId_Email",
                table: "users",
                newName: "IX_users_TenantId_Email");

            migrationBuilder.RenameIndex(
                name: "IX_Tenants_Slug",
                table: "tenants",
                newName: "IX_tenants_Slug");

            migrationBuilder.RenameColumn(
                name: "Custom",
                table: "items",
                newName: "custom");

            migrationBuilder.RenameColumn(
                name: "Copies",
                table: "items",
                newName: "copies");

            migrationBuilder.RenameIndex(
                name: "IX_Images_TenantId",
                table: "images",
                newName: "IX_images_TenantId");

            migrationBuilder.RenameColumn(
                name: "Items",
                table: "store_listings",
                newName: "items");

            migrationBuilder.AddPrimaryKey(
                name: "PK_users",
                table: "users",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_tenants",
                table: "tenants",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_items",
                table: "items",
                columns: new[] { "TenantId", "CollectionId", "Id" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_images",
                table: "images",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_groups",
                table: "groups",
                columns: new[] { "TenantId", "CollectionId", "Id" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_collections",
                table: "collections",
                columns: new[] { "TenantId", "Id" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_store_listings",
                table: "store_listings",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_collection_members",
                table: "collection_members",
                columns: new[] { "TenantId", "CollectionId", "Email" });

            migrationBuilder.AddForeignKey(
                name: "FK_collection_members_collections_TenantId_CollectionId",
                table: "collection_members",
                columns: new[] { "TenantId", "CollectionId" },
                principalTable: "collections",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_collections_tenants_TenantId",
                table: "collections",
                column: "TenantId",
                principalTable: "tenants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_groups_collections_TenantId_CollectionId",
                table: "groups",
                columns: new[] { "TenantId", "CollectionId" },
                principalTable: "collections",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_images_tenants_TenantId",
                table: "images",
                column: "TenantId",
                principalTable: "tenants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_items_collections_TenantId_CollectionId",
                table: "items",
                columns: new[] { "TenantId", "CollectionId" },
                principalTable: "collections",
                principalColumns: new[] { "TenantId", "Id" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_users_tenants_TenantId",
                table: "users",
                column: "TenantId",
                principalTable: "tenants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
