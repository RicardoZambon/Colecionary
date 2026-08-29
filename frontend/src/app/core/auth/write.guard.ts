import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';

import { I18nService } from '../i18n';
import { ToastService } from '../state/toast.service';
import { VaultStore } from '../state/vault.store';

/**
 * Keeps someone who cannot write out of a route that is *only* a write.
 *
 * **This is a courtesy, not a control.** The 403 from
 * `VaultPolicies.CanWrite` is the real answer and the only one that counts;
 * everything here does is stop the app opening a page whose every control would
 * earn one. Nothing in this file — or anywhere else in the browser — may ever be
 * the thing standing between a Viewer and a write: the token is theirs, the
 * bundle is theirs, and the server is what refuses them.
 *
 * It guards the two item-form routes and the collection-settings route, which
 * differ from every other gated surface in kind rather than in degree: they are
 * not pages with some write affordances on them, they are pages that exist in
 * order to write. Hiding their contents would leave a Viewer looking at an empty
 * form — or worse, a full one that cannot be saved — so the whole route is
 * declined and they are put back where they came from.
 *
 * The redirect is always *inward*, never to the dashboard: someone who followed
 * a stale "edit" link wanted to look at that item, and the item page shows it.
 * Query parameters travel with them for the same reason every in-collection link
 * preserves them (rule 11) — the list they were browsing is in there.
 */
export const canEditGuard: CanActivateFn = async route => {
  const store = inject(VaultStore);
  const router = inject(Router);
  const toast = inject(ToastService);
  const i18n = inject(I18nService);

  // A cold navigation straight to one of these URLs resolves guards before any
  // component is built, so without this the profile would still be null, the
  // fail-open in `canEdit` would wave a Viewer through, and the one case this
  // guard is really for — arriving by URL — would be the case it missed.
  await store.ensureLoaded();

  if (store.canEdit()) return true;

  toast.flash(i18n.t('readOnly.routeRefused'));
  return router.createUrlTree(fallbackFor(route), { queryParams: route.queryParams });
};

/**
 * The nearest page that shows the same thing without editing it: the item for an
 * edit, the collection for a new item or for its settings, and the dashboard if
 * the URL named no collection at all.
 */
function fallbackFor(route: ActivatedRouteSnapshot): unknown[] {
  const collectionId = route.paramMap.get('collectionId');
  if (!collectionId) return ['/dashboard'];
  const itemId = route.paramMap.get('itemId');
  return itemId ? ['/c', collectionId, 'items', itemId] : ['/c', collectionId];
}
