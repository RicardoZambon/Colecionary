import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { VaultApi } from './core/api/vault-api';
import { MockVaultApi } from './core/api/mock-vault-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Swap MockVaultApi for the real HTTP implementation when the backend lands.
    { provide: VaultApi, useExisting: MockVaultApi },
  ],
};
