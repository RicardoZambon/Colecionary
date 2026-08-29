import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
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

  // `{ read: ElementRef }` is not optional: `#hamburger` sits on a
  // `<ui-button>`, and a bare `viewChild` on an element that carries a component
  // hands back the *component instance*, which has no `nativeElement`.
  private readonly hamburger = viewChild('hamburger', { read: ElementRef });

  constructor() {
    effect(() => this.reflectAria(this.layout.navOpen()));
  }

  /**
   * Writes the drawer's state onto the *inner* <button> of `ui-button`.
   *
   * `[attr.aria-expanded]` at the call site would land on the <ui-button>
   * wrapper, which is neither focusable nor the thing a screen reader
   * announces — the same reason `ui-text-input` had to grow an `ariaLabel`
   * input. The right fix is two more inputs on `ui-button` (`ariaExpanded`,
   * `ariaControls`); until it has them, this is where the attributes go, and
   * `focusNavToggle` finds the button by the id set here.
   */
  private reflectAria(open: boolean): void {
    const button = this.hamburger()?.nativeElement.querySelector('button');
    if (!button) return;
    button.id = NAV_TOGGLE_ID;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-controls', NAV_DRAWER_ID);
  }

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
