using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Vault.Application.Abstractions;
using Vault.Infrastructure.Auth;
using Vault.Infrastructure.Persistence;
using Vault.Infrastructure.Persistence.Interceptors;
using Vault.Infrastructure.Persistence.Repositories;
using Vault.Infrastructure.Persistence.Seeding;
using Vault.Infrastructure.Storage;

namespace Vault.Infrastructure;

public static class DependencyInjection
{
    // contentRootPath resolves a relative ImageStorage:Root. It is passed in
    // because Infrastructure deliberately doesn't reference the hosting
    // abstractions, so it has no IHostEnvironment to ask.
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        string contentRootPath)
    {
        services.AddScoped<TenantStampingInterceptor>();
        services.AddDbContext<VaultDbContext>((sp, options) =>
            options
                .UseSqlServer(configuration.GetConnectionString("Vault"))
                .AddInterceptors(sp.GetRequiredService<TenantStampingInterceptor>()));

        services.AddScoped<Vault.Application.Setup.ISetupBootstrapper, Vault.Infrastructure.Setup.SetupBootstrapper>();

        services.AddScoped<ICollectionRepository, CollectionRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IStoreListingRepository, StoreListingRepository>();
        services.AddScoped<IImageRepository, ImageRepository>();

        services.AddOptions<JwtOptions>()
            .BindConfiguration(JwtOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.AddOptions<SeedOptions>().BindConfiguration(SeedOptions.SectionName);
        services.AddOptions<ImageStorageOptions>().BindConfiguration(ImageStorageOptions.SectionName);

        services.AddSingleton<IImageStore>(sp =>
        {
            var root = sp.GetRequiredService<IOptions<ImageStorageOptions>>().Value.Root;
            return new FileSystemImageStore(
                Path.IsPathRooted(root) ? root : Path.Combine(contentRootPath, root));
        });
        services.AddScoped<LegacyImageBlobExporter>();

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IJwtTokenService, JwtTokenService>();
        services.AddSingleton<IPasswordService, PasswordService>();
        services.AddScoped<DbSeeder>();

        return services;
    }
}
