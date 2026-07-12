import { Routes } from '@angular/router';

export const routes: Routes = [
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
    loadComponent: () =>
      import('./features/collection/item-form-page/item-form-page').then(m => m.ItemFormPage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
