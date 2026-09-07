import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  afterRenderEffect,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

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
 * **The panel is the caller's element, and this component wires it.** Put
 * {@link UiTabPanel} on the block the tabs reveal and hand it the strip:
 *
 * ```html
 * <ui-tabs #strip [tabs]="tabs()" [active]="tab()" (activeChange)="go($event)" />
 * <div class="panel" [uiTabPanel]="strip"> … </div>
 * ```
 *
 * That is the whole contract: the directive gives its own host the `role`, the
 * `id` the strip points `aria-controls` at, and the `aria-labelledby` back at
 * the selected tab — and it *registers*, so the strip knows a panel exists.
 *
 * **Why the caller no longer says so with a boolean.** There used to be a
 * `panels` input, defaulting to false with the honest note that "an
 * `aria-controls` pointing at an id that does not exist is worse than none" —
 * and then `aria-controls` was emitted for *every* tab while both call sites
 * rendered **one** panel whose id followed the selection. Three of four ids
 * never existed, which is exactly what the note forbade. A boolean cannot
 * prevent that, because it is a promise the caller makes about a relationship
 * it does not own. Now the relationship is one object: no registered panel, no
 * `aria-controls` anywhere; a registered panel, and the attribute goes on the
 * one tab whose panel that is — the selected one. The single-swapped-panel
 * pattern both consumers use is therefore correct by construction, and there is
 * no longer a way to spell the broken state.
 */
@Component({
  selector: 'ui-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A narrower window can turn a strip that fitted into one that does not, and
  // no render follows a resize on its own — so the fade would then be missing
  // exactly when it is needed.
  host: { '(window:resize)': 'measure()' },
  template: `
    <div class="strip">
      <div
        class="tabs"
        role="tablist"
        [class.more]="more()"
        (keydown)="onKeydown($event)"
        (scroll)="onScroll()"
      >
        @for (tab of tabs(); track tab.id) {
          <button
            type="button"
            role="tab"
            class="tab"
            [id]="tabDomId(tab.id)"
            [class.active]="tab.id === active()"
            [attr.aria-selected]="tab.id === active()"
            [attr.aria-controls]="tab.id === active() ? panelId() : null"
            [attr.tabindex]="tab.id === active() ? 0 : -1"
            (click)="active.set(tab.id)"
          >
            {{ tab.label }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    /*
     * The rule under the strip lives out here, on a box that does not scroll.
     * It used to be on the scroller itself, where the fade below ate its last
     * 20px on every screen width — the line that says where the tab strip ends
     * simply stopped short of the end of the tab strip.
     */
    .strip {
      border-bottom: var(--bw) solid var(--border);
    }

    .tabs {
      display: flex;
      gap: 2px;
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
       * Room for a focus ring, given back to the layout — the same trade
       * ui-dialog's body makes, and for the same reason. Asking for overflow-x
       * makes overflow-y compute to auto too, so this box clips vertically, and
       * the ring a 34px tall tab draws OUTSIDE itself was clipped away top and
       * bottom: a focused tab showed two short bars either side of its label
       * and nothing above or below, which reads as a rendering fault rather
       * than as focus. The padding buys the ring its space and the equal
       * negative margin spends it straight back, so nothing moves.
       */
      --ring-room: calc(var(--focus-width) + var(--focus-offset) * 2);
      padding-block: var(--ring-room);
      margin-block: calc(var(--ring-room) * -1);
    }

    /*
     * Says "there is more to the right" without a control that needs one. The
     * two stops are alpha, not colour: a mask reads only the alpha channel, so
     * #000 here means "keep" and transparent means "fade".
     *
     * Conditional, because it used to be unconditional: the selected last tab
     * stayed half-faded even with the strip scrolled fully to its end, so the
     * one tab the user had just chosen was the one they could not read. The
     * class is set from the scroll position — see onScroll.
     */
    .tabs.more {
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

  private readonly uid = `tabs-${nextId++}`;

  /**
   * The panel currently registered through {@link UiTabPanel}, or null.
   *
   * A signal and not a plain field: `aria-controls` is read from it during
   * rendering, and a panel that appears behind an `@if` has to move the
   * attribute with it.
   */
  private readonly panel = signal<UiTabPanel | null>(null);

  /** True while the strip's own scroller has content off its right edge. */
  protected readonly more = signal(false);

  /**
   * What the selected tab controls: the registered panel's id, or nothing.
   *
   * There is no third answer, which is the point — see the class note.
   */
  protected readonly panelId = computed(() =>
    this.panel() ? this.panelDomId(this.active()) : null,
  );

  /** The DOM id of one tab, for the panel's `aria-labelledby`. */
  tabDomId(id: string): string {
    return `${this.uid}-t-${id}`;
  }

  /** The DOM id of the panel the given tab reveals. Set by {@link UiTabPanel}. */
  panelDomId(id: string): string {
    return `${this.uid}-p-${id}`;
  }

  /** @see UiTabPanel — the registration that makes `aria-controls` resolvable. */
  attachPanel(panel: UiTabPanel): void {
    this.panel.set(panel);
  }

  /** @see UiTabPanel */
  detachPanel(panel: UiTabPanel): void {
    if (this.panel() === panel) this.panel.set(null);
  }

  /**
   * Whether the fade on the right edge is telling the truth.
   *
   * 1px of slack: a scroller at its end can report a fractional remainder from
   * the device pixel ratio, and a fade that never quite lifts is the defect
   * this replaces.
   */
  protected onScroll(): void {
    this.measure();
  }

  protected measure(): void {
    const el = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('.tabs');
    if (!el) return;
    this.more.set(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
  }

  private buttons(): HTMLElement[] {
    return [...(this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.tab')];
  }

  /** The selection this has already scrolled to, so it does so once. */
  private revealed = '';

  constructor() {
    afterRenderEffect(() => {
      // The selected tab has to be *visible*. The strip scrolls, and nothing
      // scrolled it: in pt-BR at 390px the four settings tabs are wider than
      // the column, so arriving on `?tab=access` — or the last tab of any
      // strip — showed the chosen tab half off the right edge, under the fade
      // that says there is more. Once per selection, so a user who has
      // scrolled the strip by hand is not fought.
      const active = this.active();
      if (active !== this.revealed) {
        this.revealed = active;
        const at = this.tabs().findIndex(t => t.id === active);
        // inline/block both 'nearest': this must move the strip's own
        // scroller and never the page around it.
        this.buttons()[at]?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      }

      // Measured after every render rather than once: switching to pt-BR runs
      // the labels ~20% longer and can turn a strip that fitted into one that
      // does not. Reading `tabs()` is what makes a different tab set re-run it.
      this.tabs();
      this.measure();
    });
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
    this.buttons()[next]?.focus();
  }
}

/**
 * The block a {@link UiTabs} strip reveals — `role`, `id` and
 * `aria-labelledby`, from the strip that owns the selection.
 *
 * ```html
 * <ui-tabs #strip [tabs]="tabs()" [active]="tab()" (activeChange)="go($event)" />
 * <div class="panel" [uiTabPanel]="strip"> … </div>
 * ```
 *
 * It exists so that the relationship has one owner. Written out by hand it was
 * four bindings per call site, and both call sites got the same one wrong: the
 * strip advertised `aria-controls` on all four tabs while the page rendered one
 * panel whose id followed the selection, so three of the four pointed at
 * nothing. Here the id can only come from the strip, and the strip only
 * advertises it because this directive registered — so "a tab controls a panel
 * that does not exist" has no spelling.
 *
 * **No `tabindex`.** These panels are full of focusable content, so making the
 * wrapper itself a stop only costs a keypress on the way in. A panel whose
 * whole body is text is the case that wants one, and it can ask for it.
 */
@Directive({
  selector: '[uiTabPanel]',
  host: {
    role: 'tabpanel',
    '[id]': 'domId()',
    '[attr.aria-labelledby]': 'labelId()',
  },
})
export class UiTabPanel implements OnInit, OnDestroy {
  /** The strip this panel belongs to — a template reference to the `ui-tabs`. */
  readonly strip = input.required<UiTabs>({ alias: 'uiTabPanel' });

  protected readonly domId = computed(() => this.strip().panelDomId(this.strip().active()));
  protected readonly labelId = computed(() => this.strip().tabDomId(this.strip().active()));

  /**
   * Registration happens in `ngOnInit`, not the constructor: a required input
   * is not yet bound while the constructor runs. It lands before the strip's
   * own view is refreshed, so the first paint already carries the attribute.
   */
  ngOnInit(): void {
    this.strip().attachPanel(this);
  }

  /** Handed back on destroy, so a panel behind an `@if` takes it with it. */
  ngOnDestroy(): void {
    this.strip().detachPanel(this);
  }
}
