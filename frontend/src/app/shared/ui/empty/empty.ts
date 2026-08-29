import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconName, UiIcon } from '../icon/icon';

/**
 * "There is nothing here" — said once, in one shape, with somewhere to go.
 *
 * There were twelve of these hand-written across the app in six different
 * shapes (two pairs byte-identical), and the shapes were the smaller problem.
 * The real one was that a *filtered* list and an *empty* collection shared a
 * single message, so somebody who had never touched a filter was told to clear
 * their filters. Those are different facts about the world and they need
 * different copy, which means every call site has to state which one it is —
 * hence `title` is required and the component has no default.
 *
 * The parts earn their places:
 * - `icon` gives the block a silhouette, so it reads as a considered state
 *   rather than as a failed render. It is `aria-hidden`: the title says it.
 * - `body` is optional and capped near 48ch. An empty state that needs a
 *   paragraph is a missing feature wearing a message.
 * - `[emptyActions]` is projected rather than an input, because the way out of
 *   an empty state is a real `ui-button` or a router link, and inventing an
 *   `action`/`actionLink` input pair would only reimplement one badly.
 * - `compact` drops the panel for use inside a row or a card that already has
 *   its own border — the section divider's "no items in this run" is a caption,
 *   not a landing pad.
 *
 * Deliberately not a live region. Most of these render on first paint, where a
 * `role="status"` would announce nothing (there was no change) while stealing
 * the announcement from whatever genuinely did change. A caller that empties a
 * list *in response to a keystroke* should put `aria-live` on the list region
 * it owns, where it can also say how many results there now are.
 */
@Component({
  selector: 'ui-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon],
  host: { '[class.compact]': 'compact()' },
  template: `
    <ui-icon class="mark" [name]="icon()" [size]="compact() ? 16 : 28" [strokeWidth]="1.6" />
    <p class="title">{{ title() }}</p>
    @if (body()) {
      <p class="body">{{ body() }}</p>
    }
    <div class="actions">
      <ng-content select="[emptyActions]" />
    </div>
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-2);
      padding: var(--sp-10) var(--sp-5);
      text-align: center;
      /* Dashed, not solid: the same "provisional" cue ui-card [dashed] uses,
         which is what the twelve hand-written versions were all reaching for. */
      border: var(--bw) dashed var(--border);
      border-radius: var(--radius);
      background: transparent;
    }

    .mark {
      color: var(--muted-strong);
      opacity: 0.75;
      margin-bottom: var(--sp-1);
    }

    .title {
      margin: 0;
      font-size: var(--fs-md);
      font-weight: 600;
      color: var(--text);
    }

    .body {
      margin: 0;
      /* A measure, not a width: past roughly this the block stops reading as a
         label and starts reading as documentation nobody asked for. */
      max-width: 48ch;
      font-size: var(--fs-sm);
      line-height: 1.5;
      color: var(--muted-strong);
    }

    /* Collapses to nothing when the caller projects no action, so the gap above
       does not leave a dangling row of whitespace. */
    .actions {
      display: flex;
      gap: var(--sp-2);
      flex-wrap: wrap;
      justify-content: center;

      &:empty {
        display: none;
      }
    }

    /* Inline caption form: lives inside a border that already exists. */
    :host(.compact) {
      flex-direction: row;
      gap: var(--sp-2);
      padding: 0;
      border: 0;
      text-align: left;
      justify-content: flex-start;

      .mark {
        margin-bottom: 0;
      }

      .title {
        font-size: var(--fs-xs);
        font-weight: 500;
        color: var(--muted-strong);
      }

      .body {
        font-size: var(--fs-xs);
      }
    }

    @include upto($bp-sm) {
      :host {
        padding: var(--sp-6) var(--sp-4);
      }
    }
  `,
})
export class UiEmpty {
  readonly icon = input.required<IconName>();
  /** What is empty, in the user's terms. Required — see the class comment. */
  readonly title = input.required<string>();
  /** One sentence on what to do about it. */
  readonly body = input<string | null>(null);
  /** Caption form, for use inside a surface that already has a border. */
  readonly compact = input(false);
}
