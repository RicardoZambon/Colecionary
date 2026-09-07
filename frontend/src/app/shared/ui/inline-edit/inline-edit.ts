import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';

import { UiTextInput } from '../text-input/text-input';

/**
 * A small text box that appears where you asked for it, takes the caret, and
 * answers Enter and Escape.
 *
 * **Render it inside the caller's `@if`** — one per reveal, never a hidden box
 * kept around:
 *
 * ```html
 * @if (adding()) {
 *   <ui-inline-edit
 *     [ariaLabel]="'group.newSub' | t"
 *     (committed)="addSub($event)"
 *     (cancelled)="adding.set(false)"
 *   />
 * }
 * ```
 *
 * It exists because that pattern was written out by hand four times — four
 * draft signals, four `else if (event.key === 'Escape')` branches, four
 * commit-on-blur handlers — and the app's single most-reported defect lived in
 * one of them: a `+ Sub` button whose box opened in a different column with no
 * caret in it. The focus is the part a call site cannot get right on its own:
 * the `autofocus` attribute is honoured only on initial page load and does
 * nothing to content inserted later, and until `ui-text-input` grew a
 * `focus()` there was no other way in.
 *
 * The rules, once, here:
 *
 * - **Enter commits** the trimmed draft. An empty draft is a cancellation, not
 *   an empty name — there is nothing a caller could do with `''` except refuse
 *   it, and refusing what someone did on purpose needs a message.
 * - **Escape cancels**, always, and never commits. A composer you cannot back
 *   out of by reflex is one people answer at random.
 * - **Blur commits** by default, because a typed-but-uncommitted name that
 *   vanishes when you click elsewhere is indistinguishable from a save that
 *   dropped it. Set `commitOnBlur` to false where a click elsewhere is more
 *   likely to mean "never mind".
 */
@Component({
  selector: 'ui-inline-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiTextInput],
  template: `
    <ui-text-input
      variant="subtle"
      [(value)]="draft"
      [placeholder]="placeholder()"
      [ariaLabel]="ariaLabel()"
      (keydown)="onKeydown($event)"
      (blurred)="onBlur()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class UiInlineEdit {
  /** What the box opens on. Empty for a composer, a name for a rename. */
  readonly value = input('');
  readonly placeholder = input('');
  /**
   * Required: this control has no visible label — it *is* the label's place —
   * so without a name it announces as an unnamed text field. Required rather
   * than optional for the reason `ui-empty`'s title is: an omission that
   * compiles is an omission that ships.
   */
  readonly ariaLabel = input.required<string>();
  /** See the class note. True by default. */
  readonly commitOnBlur = input(true);

  /** The trimmed, non-empty text the user accepted. */
  readonly committed = output<string>();
  /** Escape, an empty commit, or a blur with nothing in it. Means "nothing happened". */
  readonly cancelled = output<void>();

  /**
   * A linked signal, not a plain one seeded in the constructor: a signal input
   * is not yet bound while the constructor runs, so `value()` there is the
   * declared default and a rename box opened empty.
   */
  protected readonly draft = linkedSignal(() => this.value());
  private readonly field = viewChild.required(UiTextInput);
  /** Committing and cancelling are both terminal: neither may fire twice. */
  private done = false;

  constructor() {
    afterNextRender(() => {
      // A rename opens on the existing name selected, so typing replaces it;
      // a composer opens empty, where select() would do nothing anyway.
      if (this.value()) this.field().selectAll();
      else this.field().focus();
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      // Stop it here: this box is often inside a dialog, and one Escape must
      // not both abandon the name and close the dialog around it.
      event.stopPropagation();
      this.cancel();
    }
  }

  protected onBlur(): void {
    if (this.commitOnBlur()) this.commit();
    else this.cancel();
  }

  private commit(): void {
    if (this.done) return;
    const text = this.draft().trim();
    this.done = true;
    if (text) this.committed.emit(text);
    else this.cancelled.emit();
  }

  private cancel(): void {
    if (this.done) return;
    this.done = true;
    this.cancelled.emit();
  }
}
