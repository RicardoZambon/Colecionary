using System.Net;
using System.Net.Http.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Vault.Application.Collections.Dtos;
using Vault.Infrastructure.Persistence;

namespace Vault.IntegrationTests;

/// <summary>
/// Reads rows shaped the way the code wrote them <em>before</em> per-copy fields
/// existed — which is what every already-running vault actually contains.
/// </summary>
/// <remarks>
/// <para>
/// This is the test whose absence shipped a 500. Every other suite writes its
/// rows with the current code, so every <c>Copies</c> document they read already
/// carries a <c>Custom</c> key; nothing exercised a document without one. A
/// nested owned JSON collection does <b>not</b> materialise as an empty list
/// when its key is missing — EF throws while building the item, and the whole
/// collection graph fails with it.
/// </para>
/// <para>
/// It drives the real migrations rather than a copy of their SQL: migrating one
/// step down is precisely what produces the legacy shape, so the assertions
/// below are about the statements that actually ship.
/// </para>
/// </remarks>
[Collection(nameof(ApiCollection))]
public class LegacyRowCompatibilityTests(VaultApiFactory factory)
{
    private const string BeforeTheBackfill = "20260903205747_AddFieldScopesAndCollectionFields";
    private const string AfterTheBackfill = "20260904214258_BackfillCopyCustomJson";

    /// <summary>
    /// Every item's <c>Copies</c> document, verbatim.
    /// </summary>
    /// <remarks>
    /// Migrating down rewrites <em>every</em> row, not only this test's, so it
    /// would strip the per-copy values the seeded demo vault carries and that
    /// <c>ContractTests</c> reads. Snapshotting the raw JSON and putting it back
    /// leaves the database byte-identical, and does it without this test knowing
    /// anything about what the seeder writes.
    /// </remarks>
    private async Task<List<(string Collection, string Item, string Copies)>> SnapshotCopies()
    {
        var rows = new List<(string, string, string)>();
        await using var connection = new SqlConnection(factory.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT CollectionId, Id, Copies FROM Catalog.Items;";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        }

        return rows;
    }

    private async Task RestoreCopies(List<(string Collection, string Item, string Copies)> rows)
    {
        await using var connection = new SqlConnection(factory.ConnectionString);
        await connection.OpenAsync();
        foreach (var row in rows)
        {
            await using var command = connection.CreateCommand();
            command.CommandText =
                "UPDATE Catalog.Items SET Copies = @j WHERE CollectionId = @c AND Id = @i;";
            command.Parameters.AddWithValue("@j", row.Copies);
            command.Parameters.AddWithValue("@c", row.Collection);
            command.Parameters.AddWithValue("@i", row.Item);
            await command.ExecuteNonQueryAsync();
        }
    }

    private async Task MigrateTo(string target)
    {
        using var scope = factory.Services.CreateScope();
        // IMigrator is one of EF's internal services, so it comes from the
        // context's own provider rather than the application's.
        var db = scope.ServiceProvider.GetRequiredService<VaultDbContext>();
        await db.GetService<IMigrator>().MigrateAsync(target);
    }

    [Fact]
    public async Task AVaultStoredBeforePerCopyFields_StillReads()
    {
        var client = await factory.CreateAuthenticatedClientAsync("marcus@example.com");

        var created = (await (await client.PostAsJsonAsync(
            "/api/collections",
            new CreateCollectionRequest("Legacy", "Rows from before")))
            .Content.ReadFromJsonAsync<CollectionDto>())!;

        var seeded = created with
        {
            Items =
            [
                new ItemDto("i1", "One Piece Vol. 1", "", 1997, 45, "", [], "",
                    [new CustomFieldValueDto("Volumes", "1")],
                    Copies:
                    [
                        new ItemCopyDto("i1_c1", "Good", 12),
                        new ItemCopyDto("i1_c2", "Mint", 30),
                    ]),
            ],
        };
        (await client.PutCollectionAsync(seeded)).EnsureSuccessStatusCode();

        var before = await SnapshotCopies();

        try
        {
            // Down() strips the key from every stored copy, which *is* the shape
            // a vault running yesterday's build has on disk.
            await MigrateTo(BeforeTheBackfill);

            // Pinned deliberately: this is the failure the user saw, and it is
            // the reason the backfill is not optional. If a future EF release
            // starts tolerating the absent key this assertion fails, and the
            // right response is to read the release notes, not to delete it.
            var beforeBackfill = await client.GetAsync("/api/collections");
            Assert.Equal(HttpStatusCode.InternalServerError, beforeBackfill.StatusCode);

            await MigrateTo(AfterTheBackfill);

            var response = await client.GetAsync("/api/collections");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            var fetched = (await response.Content.ReadFromJsonAsync<List<VersionedCollectionDto>>())!
                .Single(c => c.Collection.Id == created.Id).Collection;

            var item = Assert.Single(fetched.Items);
            // Order is preserved: a copy's position is what the item form and the
            // item page render, and STRING_AGG has no ordering of its own.
            Assert.Equal(["i1_c1", "i1_c2"], item.Copies.Select(c => c.Id));
            Assert.All(item.Copies, copy => Assert.Empty(copy.Custom));
            // And nothing else in the document was disturbed by the rewrite.
            Assert.Equal(["Good", "Mint"], item.Copies.Select(c => c.Condition));
            Assert.Equal([12m, 30m], item.Copies.Select(c => c.Price));
            Assert.Equal("1", Assert.Single(item.Custom).Value);
        }
        finally
        {
            // Never leave the shared database a step behind, or a row rewritten,
            // whatever failed.
            await MigrateTo(AfterTheBackfill);
            await RestoreCopies(before);
            await client.DeleteAsync($"/api/collections/{created.Id}");
        }
    }
}
