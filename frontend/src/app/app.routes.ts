import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { unsavedItemGuard } from './features/collection/item-form-page/unsaved-item.guard';
import { setupCompletedGuard, setupGuard } from './core/setup/setup.guards';
import { Shell } from './layout/shell/shell';

export const routes: Routes = [
  {
    path: 'setup',
    canActivate: [setupCompletedGuard],
    loadComponent: () => import('./features/setup/setup-page').then(m => m.SetupPage),
  },
  {
    path: 'login',
    canActivate: [setupGuard],
    loadComponent: () => import('./features/auth/login-page').then(m => m.LoginPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [setupGuard, authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard-page').then(m => m.DashboardPage),
      },
      {
        path: 'store',
        loadComponent: () => import('./features/store/store-page').then(m => m.StorePage),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings-page').then(m => m.SettingsPage),
      },
      {
        path: 'c/:collectionId',
        loadComponent: () =>
          import('./features/collection/collection-page/collection-page').then(m => m.CollectionPage),
      },
      {
        path: 'c/:collectionId/settings',
        loadComponent: () =>
          import('./features/collection/collection-settings-page/collection-settings-page').then(
            m => m.CollectionSettingsPage,
          ),
      },
      {
        path: 'c/:collectionId/items/new',
        canDeactivate: [unsavedItemGuard],
        loadComponent: () =>
          import('./features/collection/item-form-page/item-form-page').then(m => m.ItemFormPage),
      },
      {
        path: 'c/:collectionId/items/:itemId',
        loadComponent: () =>
          import('./features/collection/item-page/item-page').then(m => m.ItemPage),
      },
      {
        path: 'c/:collectionId/items/:itemId/edit',
        canDeactivate: [unsavedItemGuard],
        loadComponent: () =>
          import('./features/collection/item-form-page/item-form-page').then(m => m.ItemFormPage),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
