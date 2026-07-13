using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Vault.Application.Abstractions;
using Vault.Infrastructure.Auth;
using Vault.Infrastructure.Persistence;
using Vault.Infrastructure.Persistence.Interceptors;
using Vault.Infrastructure.Persistence.Repositories;
using Vault.Infrastructure.Persistence.Seeding;

namespace Vault.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddScoped<TenantStampingInterceptor>();
        services.AddDbContext<VaultDbContext>((sp, options) =>
            options
                .UseNpgsql(configuration.GetConnectionString("Vault"))
                .AddInterceptors(sp.GetRequiredService<TenantStampingInterceptor>()));

        services.AddScoped<ICollectionRepository, CollectionRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IStoreListingRepository, StoreListingRepository>();
        services.AddScoped<IImageRepository, ImageRepository>();

        services.AddOptions<JwtOptions>()
            .BindConfiguration(JwtOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();
        services.AddOptions<SeedOptions>().BindConfiguration(SeedOptions.SectionName);

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IJwtTokenService, JwtTokenService>();
        services.AddSingleton<IPasswordService, PasswordService>();
        services.AddScoped<DbSeeder>();

        return services;
    }
}
