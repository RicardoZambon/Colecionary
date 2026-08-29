import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MessageKey } from '../../../core/i18n';
import { VaultStore } from '../../../core/state/vault.store';
import { TPipe } from '../../pipes/t.pipe';
import { UiIcon } from '../icon/icon';

/** Which permission the surface this notice sits on actually needs. */
export type NoticeScope = 'edit' | 'administer';

/**
 * Says why a screen looks bare.
 *
 * Every write affordance in the app is hidden rather than disabled from someone
 * who cannot use it — a disabled button invites "why?", and the answer is a
 * property of the whole session rather than of that button. That is the right
 * trade only if the answer is written down *somewhere*, or a Viewer is left
 * staring at a collection page with no "add item", no checkboxes and no
 * explanation, wondering what they broke. This is that somewhere.
 *
 * It renders **nothing** for anyone who has the permission, so a call site is an
 * unconditional tag rather than a duplicated condition — the test lives in one
 * place and cannot drift from the affordances it explains. Deliberately used on
 * two surfaces only, the collection page and the account settings page: a notice
 * repeated on every screen stops being information and becomes chrome.
 *
 * `scope` names what the surface needs; the *wording* follows the reader's role
 * instead, because an Editor on the account page and a Viewer on a collection
 * are two different sentences and telling an Editor their access is view-only
 * would be false.
 *
 * The panel is an inner element rather than the host, so that "nobody needs to
 * read this" collapses to genuinely nothing — a host carrying the border and the
 * padding would leave an empty box behind.
 *
 * Not a live region. It is there on first paint, where `role="status"` would
 * announce nothing while stealing the announcement from whatever did change.
 */
@Component({
  selector: 'ui-read-only-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiIcon],
  template: `
    @if (visible()) {
      <div class="notice">
        <ui-icon class="mark" name="eye" [size]="16" [strokeWidth]="1.8" />
        <span class="text">
          <span class="title">{{ titleKey() | t }}</span>
          <span class="body">{{ bodyKey() | t }}</span>
        </span>
      </div>
    }
  `,
  styles: `
    /*
     * The host generates no box of its own, so a session that can write is not
     * charged for this component being in the tree.
     *
     * It is placed as the first child of the collection page's main column,
     * which is a flex column with a 16px gap. Without this the empty host was
     * still a flex item, so every Owner and Editor got 16px of dead space at
     * the top of the right-hand panel and the list card sat lower than the
     * group panel beside it. display: contents makes .notice the flex item
     * when there is one, and nothing at all when there is not.
     */
    :host {
      display: contents;
    }

    .notice {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      /* panel2, not warn: this is a statement of fact about the session, not a
         warning that something is going wrong. Rule 18 keeps the alarm colours
         for alarms. */
      background: var(--panel2);
    }

    .mark {
      color: var(--muted-strong);
      /* Optical alignment with the first line of text, not with the box. */
      margin-top: 1px;
    }

    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .title {
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--text);
    }

    .body {
      /* A measure, not a width — past this it reads as documentation. */
      max-width: 68ch;
      font-size: var(--fs-sm);
      line-height: 1.5;
      color: var(--muted-strong);
    }
  `,
})
export class UiReadOnlyNotice {
  private readonly store = inject(VaultStore);

  /**
   * What this surface needs of the reader: `edit` for catalogue content,
   * `administer` for the account itself.
   */
  readonly scope = input<NoticeScope>('edit');

  protected readonly visible = computed(() =>
    this.scope() === 'administer' ? !this.store.canAdminister() : !this.store.canEdit(),
  );

  /** Can write content but not administer the account — an Editor. */
  private readonly editorOnly = computed(() => this.store.canEdit());

  protected readonly titleKey = computed<MessageKey>(() =>
    this.editorOnly() ? 'readOnly.account.title' : 'readOnly.vault.title',
  );

  protected readonly bodyKey = computed<MessageKey>(() =>
    this.editorOnly() ? 'readOnly.account.body' : 'readOnly.vault.body',
  );
}
