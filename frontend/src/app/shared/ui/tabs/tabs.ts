import { ChangeDetectionStrategy, Component, ElementRef, inject, input, model } from '@angular/core';

export interface TabDef {
  id: string;
  label: string;
}

let nextId = 0;

/**
 * A tab strip. `role="tab"` is a promise of a keyboard model, and this now
 * keeps it: Left/Right move between tabs and Home/End jump to the ends, with a
 * roving `tabindex` so Tab enters the strip once and leaves it once rather than
 * stopping on every tab.
 *
 * **It scrolls rather than overflowing the page.** Four Portuguese settings
 * tabs are about 470px of unshrinkable content in a 358px phone column; flex
 * items refuse to shrink below their text, so the *main region* became
 * horizontally scrollable and the fourth tab was reachable only by swiping the
 * cards sideways — with nothing on screen to say it existed. The strip owns its
 * own overflow now, and the fade on the right edge is what says there is more.
 *
 * **The panel is the caller's.** Wrap the block each tab reveals in
 * `role="tabpanel"`, give it `panelDomId(active())` and point its
 * `aria-labelledby` at `tabDomId(active())`, then set `[panels]="true"` so the
 * tabs advertise what they control:
 *
 * ```html
 * <ui-tabs #tabs [tabs]="tabs" [(active)]="tab" [panels]="true" />
 * <div role="tabpanel" [id]="tabs.panelDomId(tab())"
 *      [attr.aria-labelledby]="tabs.tabDomId(tab())" tabindex="0"> … </div>
 * ```
 *
 * `panels` defaults to false because an `aria-controls` pointing at an id that
 * does not exist is worse than none.
 */
@Component({
  selector: 'ui-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist" (keydown)="onKeydown($event)">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          class="tab"
          [id]="tabDomId(tab.id)"
          [class.active]="tab.id === active()"
          [attr.aria-selected]="tab.id === active()"
          [attr.aria-controls]="panels() ? panelDomId(tab.id) : null"
          [attr.tabindex]="tab.id === active() ? 0 : -1"
          (click)="active.set(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    .tabs {
      display: flex;
      gap: 2px;
      border-bottom: var(--bw) solid var(--border);
      /*
       * The strip absorbs its own overflow. Without this the page did: .main
       * has overflow-y: auto, and the spec forbids one axis being visible while
       * the other is not, so overflow-x silently computed to auto and the whole
       * region scrolled sideways — which is also why the document-level
       * scrollWidth check never saw it.
       */
      overflow-x: auto;
      scrollbar-width: thin;
      scroll-snap-type: x proximity;
      /*
       * Says "there is more to the right" without a control that needs one.
       * The two stops are alpha, not colour: a mask reads only the alpha
       * channel, so #000 here means "keep" and transparent means "fade".
       * Invisible when nothing overflows, because the faded strip is then
       * empty space.
       */
      -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent);
      mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent);
    }

    .tab {
      background: none;
      border: none;
      padding: 8px 16px;
      font-size: 12.5px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      /* --muted is the decorative grey and an unselected tab is a control:
         2.7-4.1:1 across the themes made three of four tabs barely readable. */
      color: var(--muted-strong);
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      /* A tab must not shrink below its label — a half-word is not a name — and
         must not wrap, or the strip's height jumps as the language changes. */
      flex: none;
      white-space: nowrap;
      scroll-snap-align: start;

      &:hover {
        color: var(--text);
      }

      /* The type layer of the accent, not the fill: --accent measures 3.49:1 on
         --panel2 in paper, and this is a word being read, not a bar. */
      &.active {
        color: var(--accent-strong);
        border-bottom-color: var(--accent);
      }
    }

    @include upto($bp-lg) {
      .tab {
        min-height: var(--tap);
      }
    }
  `,
})
export class UiTabs {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly tabs = input.required<TabDef[]>();
  readonly active = model.required<string>();

  /** True once the caller renders a `role="tabpanel"` per tab. See the class note. */
  readonly panels = input(false);

  private readonly uid = `tabs-${nextId++}`;

  /** The DOM id of one tab, for a panel's `aria-labelledby`. */
  tabDomId(id: string): string {
    return `${this.uid}-t-${id}`;
  }

  /** The DOM id the caller must give the panel that tab reveals. */
  panelDomId(id: string): string {
    return `${this.uid}-p-${id}`;
  }

  /**
   * Arrow keys select *and* move focus, which is the automatic-activation
   * pattern: these tabs swap a `?tab=` query parameter, so following the
   * selection costs nothing and a user arrowing through them hears each one.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const ids = this.tabs().map(t => t.id);
    const at = ids.indexOf(this.active());
    let next = -1;

    switch (event.key) {
      case 'ArrowRight':
        next = (at + 1) % ids.length;
        break;
      case 'ArrowLeft':
        next = at <= 0 ? ids.length - 1 : at - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = ids.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.active.set(ids[next]);
    // Focus follows, or the roving tabindex leaves focus on a tab that is no
    // longer selected and the next arrow starts from the wrong place.
    (this.host.nativeElement as HTMLElement)
      .querySelectorAll<HTMLElement>('.tab')
      [next]?.focus();
  }
}
