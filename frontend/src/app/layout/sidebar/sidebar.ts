import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterRenderEffect,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { LayoutService } from '../../core/state/layout.service';
import { VaultStore } from '../../core/state/vault.store';
import { TPipe } from '../../shared/pipes/t.pipe';
// Deep imports, not the `shared/ui` barrel: the barrel re-exports the
// lightbox, the photo manager, the mosaic and the framing editor, and this
// component is in the initial chunk — so importing it by name dragged all four
// into the first bytes the browser downloads.
import { UiButton } from '../../shared/ui/button/button';
import { UiIcon } from '../../shared/ui/icon/icon';
import { NewCollectionAction } from '../new-collection';
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
  protected readonly create = inject(NewCollectionAction);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  protected readonly drawerId = NAV_DRAWER_ID;

  private readonly firstLink = viewChild<ElementRef<HTMLElement>>('firstLink');

  constructor() {
    // `afterRenderEffect`, not `effect`. Opening a drawer without moving focus
    // into it leaves the keyboard user exactly where they were, tabbing through
    // a page they can no longer see — but a plain effect ran *before* the host
    // binding that lifts this drawer's own `inert`, and `.focus()` inside an
    // inert subtree is silently ignored. So focus stayed on the hamburger, or
    // on `<body>` once the top bar went inert behind it.
    afterRenderEffect(() => {
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
    focusNavToggle(this.document, this.injector);
  }
}
