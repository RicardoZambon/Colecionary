namespace Vault.IntegrationTests;

/// <summary>
/// Shares one API + SQL Server container across all integration test classes —
/// container startup dominates test time.
/// </summary>
[CollectionDefinition(nameof(ApiCollection))]
public sealed class ApiCollection : ICollectionFixture<VaultApiFactory>;
