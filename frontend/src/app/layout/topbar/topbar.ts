import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n';
import { LayoutService } from '../../core/state/layout.service';
import { ThemeService } from '../../core/state/theme.service';
import { VaultStore } from '../../core/state/vault.store';
import { pathOf } from '../../core/utils/groups.util';
import { UiAvatar, UiButton, UiDropdown, UiFlag, UiIcon, UiTextInput } from '../../shared/ui';
import { TPipe } from '../../shared/pipes/t.pipe';
import { NAV_DRAWER_ID, NAV_TOGGLE_ID } from '../nav-focus';

/**
 * A name reduced to a path segment: lower case, accents dropped, runs of
 * anything unsafe collapsed to a single dash.
 *
 * Not `encodeURIComponent`: this is never parsed back, it is only read. A crumb
 * exists to tell somebody where they are, so it is built from names — the ids
 * are in the address bar, where they belong.
 */
function slug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || '-'
  );
}

@Component({
  selector: 'app-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, UiAvatar, UiButton, UiDropdown, UiFlag, UiIcon, UiTextInput],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar {
  protected readonly store = inject(VaultStore);
  protected readonly layout = inject(LayoutService);
  protected readonly theme = inject(ThemeService);
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly toggleId = NAV_TOGGLE_ID;
  protected readonly drawerId = NAV_DRAWER_ID;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly crumb = computed(() => {
    const tree = this.router.parseUrl(this.url());
    const segments = tree.root.children['primary']?.segments.map(s => s.path) ?? [];
    const parts = ['~'];

    if (segments[0] === 'c' && segments[1]) {
      const collection = this.store.collection(segments[1]);
      // The collection's *name*, slugified — not its id. Ids are client-generated
      // (`c06143f901b1646b`), so the crumb read `~/c06143f901b1646b` for every
      // collection created in the app, which tells the reader nothing and leaks
      // an internal identifier into the chrome. The id is the fallback only for
      // a collection the store has not loaded, where the segment is all there is.
      parts.push(collection ? slug(collection.name) : segments[1]);
      const groupId = tree.queryParams['g'];
      if (collection && groupId) {
        const names = pathOf(collection.groups, groupId).map(g => slug(g.name));
        parts.push(...(names.length > 2 ? ['…', ...names.slice(-2)] : names));
      }
      if (segments[2] === 'items') {
        // The item's name on detail, and the verb on the form. Same reasoning as
        // the collection: an id in the crumb is chrome nobody can read.
        if (segments[3] === 'new') parts.push(this.i18n.t('crumb.new'));
        else if (segments[4] === 'edit') parts.push(this.i18n.t('crumb.edit'));
        else {
          const item = collection?.items.find(i => i.id === segments[3]);
          parts.push(item ? slug(item.name) : segments[3]);
        }
      }
      if (segments[2] === 'settings') parts.push(this.i18n.t('crumb.settings'));
    } else {
      parts.push(segments[0] ?? 'dashboard');
    }
    return parts.join('/');
  });
}
