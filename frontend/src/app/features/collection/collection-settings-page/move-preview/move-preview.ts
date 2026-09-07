import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiButton } from '../../../../shared/ui';

/** Everything the pane says about a move, already in the user's language. */
export interface MoveImpactCopy {
  heading: string;
  gained: string;
  lost: string[];
  dormant: string;
  order: string;
  clash: string;
  nothing: string;
}

/**
 * What a pending group move would change, in sentences, with the two answers.
 *
 * Purely presentational: it takes the sentences and emits which button was
 * pressed. The page owns the pending choice and the graph, so this cannot
 * describe a different move than the one it applies.
 *
 * Its own component rather than a block in the settings page, and the reason is
 * the 6 kB per-component style budget: that page is a tree, a detail editor,
 * two chip lists, a sharing tab and a general tab, and every self-contained
 * block that stays inside it is a block spending the same budget the rest of
 * the page needs. The classes are unchanged, so the styles read the same.
 */
@Component({
  selector: 'app-move-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton],
  template: `
    <div class="move-preview" role="status">
      <span class="fields-label">{{ 'collSettings.groups.moveHeading' | t }}</span>
      <p class="move-preview__head">{{ impact().heading }}</p>
      <ul class="move-preview__list">
        @if (impact().gained) {
          <li>{{ impact().gained }}</li>
        }
        @for (line of impact().lost; track line) {
          <li class="move-preview__lost">{{ line }}</li>
        }
        @if (impact().order) {
          <li>{{ impact().order }}</li>
        }
        @if (impact().nothing) {
          <li>{{ impact().nothing }}</li>
        }
      </ul>
      @if (impact().dormant) {
        <p class="move-preview__note">{{ impact().dormant }}</p>
      }
      @if (impact().clash) {
        <p class="move-preview__clash">{{ impact().clash }}</p>
      }
      <div class="move-preview__actions">
        <ui-button size="sm" variant="ghost" (click)="cancelled.emit()"
          >{{ 'collSettings.groups.moveCancel' | t }}</ui-button>
        <ui-button size="sm" (click)="confirmed.emit()"
          >{{ 'collSettings.groups.moveConfirm' | t }}</ui-button>
      </div>
    </div>
  `,
  styles: `
    @use '../../../../../styles/mixins' as *;

    .fields-label {
      @include mono-label(var(--fs-xs), 0.1em);
      text-transform: uppercase;
    }

    /*
     * The preview a move has to survive before it commits. fieldsFor merges
     * the whole ancestor path and sortFor takes the nearest ancestor that
     * sets one, so a move re-declares what every item in the branch shows —
     * and nothing afterwards looks broken, which is exactly why it is stated
     * up front.
     */
    .move-preview {
      margin-top: var(--sp-3);
      padding: var(--sp-3);
      border: var(--bw) solid var(--accent);
      border-radius: var(--radius);
      background: var(--panel2);
      font-size: var(--fs-sm);
      color: var(--text2);

      &__head {
        margin: var(--sp-1) 0 var(--sp-2);
        color: var(--text);
        font-weight: 600;
      }

      &__list {
        margin: 0;
        padding-left: var(--sp-5);
      }

      &__note,
      &__clash {
        margin: var(--sp-2) 0 0;
      }

      &__lost,
      &__clash {
        color: var(--warn-strong);
      }

      &__note {
        color: var(--muted-strong);
        font-size: var(--fs-xs);
      }

      &__actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--sp-2);
        margin-top: var(--sp-3);
      }
    }
  `,
})
export class MovePreview {
  readonly impact = input.required<MoveImpactCopy>();
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
