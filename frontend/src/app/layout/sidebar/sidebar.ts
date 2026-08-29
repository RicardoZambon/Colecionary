import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { LayoutService } from '../../core/state/layout.service';
import { VaultStore } from '../../core/state/vault.store';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton, UiIcon } from '../../shared/ui';
import { NAV_DRAWER_ID, focusNavToggle } from '../nav-focus';

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, TPipe, UiButton, UiIcon],
  host: {
    '[id]': 'drawerId',
    '[class.drawer--open]': 'layout.compact() && layout.navOpen()',
    // Only below the breakpoint is there anything to hide: above it the sidebar
    // is a plain column and marking it hidden would take the whole navigation
    // away from a screen reader on a desktop. `inert` matters as much as
    // `aria-hidden` — an off-canvas nav that is still tabbable is a dozen
    // invisible tab stops in front of the page content.
    '[attr.aria-hidden]': 'hidden() ? "true" : null',
    '[inert]': 'hidden()',
  },
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  protected readonly store = inject(VaultStore);
  protected readonly layout = inject(LayoutService);
  private readonly document = inject(DOCUMENT);

  protected readonly drawerId = NAV_DRAWER_ID;

  private readonly firstLink = viewChild<ElementRef<HTMLElement>>('firstLink');

  constructor() {
    effect(() => {
      // Opening a drawer without moving focus into it leaves the keyboard user
      // exactly where they were, tabbing through a page they can no longer see.
      if (this.layout.compact() && this.layout.navOpen()) {
        this.firstLink()?.nativeElement.focus();
      }
    });
  }

  protected hidden(): boolean {
    return this.layout.compact() && !this.layout.navOpen();
  }

  /** Closing by choice, rather than by having navigated somewhere. */
  protected dismiss(): void {
    this.layout.closeNav();
    focusNavToggle(this.document);
  }
}
