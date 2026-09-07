import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { I18nService } from '../../../core/i18n';
import { Toast, ToastService } from '../../../core/state/toast.service';
import { TPipe } from '../../pipes/t.pipe';
import { UiButton } from '../button/button';
import { UiIcon } from '../icon/icon';

/**
 * Global toast outlet — rendered once in the app shell.
 *
 * Three things it is careful about:
 *
 * 1. **Tone is never only a colour.** Every toast carries a text marker
 *    (`Done` / `Failed`) beside the message, so the difference between "saved"
 *    and "not saved" survives a colour-blind reader, a greyscale screenshot and
 *    a theme whose accent happens to be red.
 * 2. **Every toast is announced, not merely drawn.** The two live regions are
 *    always in the DOM and always empty until there is something to say.
 *    That is the part that was wrong: assistive technology announces changes
 *    to a region it was *already observing*, so a `role="status"` element
 *    inserted together with its text is reliably missed. `role="alert"` is the
 *    special case most readers still catch on insertion, which is why failures
 *    appeared to work and nothing else did — a save, an export and a role
 *    change were all silent.
 * 3. **Every toast can be dismissed.** The close button used to be inside the
 *    error branch, tying "can I get rid of this" to tone; an info toast owns
 *    the bottom of a phone screen, which is where a docked dialog's buttons
 *    are.
 * 4. **An error has to be dismissed.** It carries no timer, so a failure
 *    cannot expire unread while the user was looking elsewhere.
 */
@Component({
  selector: 'ui-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiIcon],
  template: `
    <!--
      Hoisted out of the @if, and never removed: these two are the live regions,
      and a live region only announces what changes *inside* one that was
      already being observed. The visual toast below carries no role of its own
      any more, so nothing is announced twice.
    -->
    <div class="sr-only" role="status" aria-live="polite">{{ politeText() }}</div>
    <div class="sr-only" role="alert">{{ assertiveText() }}</div>

    @if (toast.current(); as current) {
      <div
        class="toast"
        [class.toast--success]="current.tone === 'success'"
        [class.toast--error]="current.tone === 'error'"
      >
        @if (current.tone !== 'info') {
          <!-- The marker is text as well as a mark: rule 12 does not allow
               status to be carried by colour alone, and the word beside the
               ring is what carries it. The mark stays aria-hidden precisely
               because that word is already there: naming it too would announce
               the tone twice. -->
          <span class="toast__mark" aria-hidden="true">
            <ui-icon
              class="toast__glyph"
              [name]="current.tone === 'error' ? 'alert' : 'check'"
              [size]="13"
              [strokeWidth]="2.1"
            />
            {{ (current.tone === 'error' ? 'toast.failed' : 'toast.done') | t }}
          </span>
        }
        <span class="toast__text" aria-hidden="true">{{ current.message }}</span>

        @if (current.action; as action) {
          <ui-button variant="link" size="sm" class="toast__action" (click)="toast.act()">
            {{ action.labelKey | t }}
          </ui-button>
        }

        <!-- Outside the tone branch: dismissal is not a property of tone. -->
        <button
          type="button"
          class="toast__close"
          [attr.aria-label]="'toast.dismiss' | t"
          (click)="toast.dismiss()"
        ><ui-icon name="close" [size]="13" /></button>

        @if (toast.waiting()) {
          <!-- Says out loud that something is queued behind this one, so a
               dismissal never looks like the end of the story. -->
          <span class="toast__more" aria-hidden="true">{{
            'toast.more' | t: { n: toast.waiting() }
          }}</span>
        }
      </div>
    }
  `,
  styles: `
    .toast {
      position: fixed;
      right: var(--sp-5);
      bottom: var(--sp-5);
      z-index: var(--z-toast);
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      max-width: min(440px, calc(100vw - var(--sp-8)));
      padding: var(--sp-3) var(--sp-4);
      border: var(--bw) solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: var(--radius);
      background: var(--panel);
      color: var(--text);
      font-size: var(--fs-sm);
      font-weight: 600;
      line-height: 1.45;
      box-shadow: var(--shadow);
    }

    /*
     * Panel-coloured rather than accent-filled, which is what makes room for a
     * tone at all: the old toast painted every message — success and failure
     * alike — in --accent, so the colour said nothing.
     */
    .toast--success {
      border-left-color: var(--good);
    }

    .toast--error {
      border-left-color: var(--danger);
    }

    .toast__mark {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      flex: none;
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text2);
    }

    .toast--error .toast__mark {
      color: var(--danger);
    }

    /*
     * No ring any more. The circle existed to make a bare ✓ or ! character look
     * deliberate; a drawn mark already does, and a triangle inside a 15px
     * circle is two shapes fighting for the same ten pixels. Colour comes from
     * .toast__mark, so the mark follows the tone with the word.
     */
    .toast__glyph {
      flex: none;
    }

    .toast__text {
      min-width: 0;
    }

    .toast__action {
      flex: none;
    }

    .toast__close {
      display: inline-flex;
      align-items: center;
      flex: none;
      background: none;
      border: 0;
      padding: 0 var(--sp-1);
      color: var(--text2);
      font-size: var(--fs-md);
      cursor: pointer;

      &:hover {
        color: var(--text);
      }
    }

    .toast__more {
      flex: none;
      color: var(--muted-strong);
      font-size: var(--fs-xs);
      font-weight: 600;
    }

    @media (max-width: 560px) {
      .toast {
        right: var(--sp-3);
        left: var(--sp-3);
        bottom: var(--sp-3);
        max-width: none;
        flex-wrap: wrap;
      }
    }
  `,
})
export class UiToast {
  protected readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  /** Success and information, announced without interrupting. */
  protected readonly politeText = computed(() => {
    const current = this.toast.current();
    return current && current.tone !== 'error' ? this.spoken(current) : '';
  });

  /** Failures, which interrupt — the user is about to act on a wrong belief. */
  protected readonly assertiveText = computed(() => {
    const current = this.toast.current();
    return current?.tone === 'error' ? this.spoken(current) : '';
  });

  /**
   * The marker word plus the message, so what is spoken carries the same tone
   * the drawn toast does. The `Done` / `Failed` word is the tone in text, and
   * without it a spoken "Couldn't reach the server" and a spoken "Saved" are
   * the same kind of sentence.
   */
  private spoken(current: Toast): string {
    if (current.tone === 'info') return current.message;
    const mark = this.i18n.t(current.tone === 'error' ? 'toast.failed' : 'toast.done');
    return `${mark}: ${current.message}`;
  }
}
