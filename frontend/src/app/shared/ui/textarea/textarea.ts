import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'ui-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <textarea
      [value]="value()"
      [rows]="rows()"
      [placeholder]="placeholder()"
      (input)="onInput($event)"
    ></textarea>
  `,
  styles: `
    :host {
      display: block;
    }

    textarea {
      width: 100%;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      color: var(--text);
      border-radius: var(--radius);
      padding: 9px 12px;
      font-family: var(--font-body);
      font-size: 13px;
      /* Deliberately no 'outline: none'. Angular scopes this rule to
         textarea[_ngcontent-…], which outranks the global :focus-visible ring
         in styles.scss — suppressing it here leaves every textarea in the app
         with no visible focus at all. */
      resize: vertical;
    }
  `,
})
export class UiTextarea {
  readonly value = model('');
  readonly rows = input(3);
  readonly placeholder = input('');

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }
}
