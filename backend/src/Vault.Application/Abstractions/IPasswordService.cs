using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

public interface IPasswordService
{
    string Hash(User user, string password);

    bool Verify(User user, string hash, string password);
}
