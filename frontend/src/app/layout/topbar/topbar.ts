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
      parts.push(segments[1]);
      const collection = this.store.collection(segments[1]);
      const groupId = tree.queryParams['g'];
      if (collection && groupId) {
        const names = pathOf(collection.groups, groupId).map(g =>
          g.name.toLowerCase().replace(/\s+/g, '-'),
        );
        parts.push(...(names.length > 2 ? ['…', ...names.slice(-2)] : names));
      }
      if (segments[2] === 'items') {
        // Mirrors the design's crumb: item id on detail, new/edit on the form.
        if (segments[3] === 'new') parts.push('new');
        else if (segments[4] === 'edit') parts.push('edit');
        else parts.push(segments[3]);
      }
      if (segments[2] === 'settings') parts.push('edit');
    } else {
      parts.push(segments[0] ?? 'dashboard');
    }
    return parts.join('/');
  });
}
