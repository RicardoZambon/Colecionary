using Microsoft.Data.SqlClient;
using Vault.Application.Setup;

namespace Vault.Infrastructure.Setup;

/// <summary>
/// Classifies a candidate SQL Server connection so the wizard can give a useful
/// message. "Database missing but creatable" is a pass — EF creates it during
/// migration when the login has sysadmin/dbcreator.
/// </summary>
public sealed class DatabaseConnectionTester : IDatabaseConnectionTester
{
    public async Task<DatabaseConnectionResult> TestAsync(string connectionString, CancellationToken ct = default)
    {
        try
        {
            await using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync(ct);
            return DatabaseConnectionResult.Success;
        }
        catch (SqlException ex) when (IsDatabaseMissing(ex))
        {
            return await CanCreateDatabaseAsync(connectionString, ct)
                ? DatabaseConnectionResult.DatabaseMissingButCanBeCreated
                : DatabaseConnectionResult.DatabaseMissingAndCannotCreate;
        }
        catch (SqlException ex) when (ex.Number == 18456)
        {
            return DatabaseConnectionResult.LoginRejected;
        }
        catch (SqlException)
        {
            return DatabaseConnectionResult.HostUnreachable;
        }
        catch (Exception)
        {
            return DatabaseConnectionResult.Unknown;
        }
    }

    // 4060 = cannot open database; 911 = database does not exist.
    private static bool IsDatabaseMissing(SqlException ex) => ex.Number is 4060 or 911;

    private static async Task<bool> CanCreateDatabaseAsync(string connectionString, CancellationToken ct)
    {
        try
        {
            var master = new SqlConnectionStringBuilder(connectionString) { InitialCatalog = "master" };
            await using var connection = new SqlConnection(master.ConnectionString);
            await connection.OpenAsync(ct);
            await using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT CASE WHEN IS_SRVROLEMEMBER('sysadmin') = 1 OR IS_SRVROLEMEMBER('dbcreator') = 1 THEN 1 ELSE 0 END";
            return Convert.ToInt32(await command.ExecuteScalarAsync(ct)) == 1;
        }
        catch
        {
            return false;
        }
    }
}
