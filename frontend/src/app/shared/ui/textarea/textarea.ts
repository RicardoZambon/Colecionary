import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'ui-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <textarea
      [class.mono]="mono()"
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

    /*
     * For text whose shape carries meaning — delimited columns, an id, a key.
     * An input on the component rather than a font set from the page: a host
     * rule cannot reach past this element's own declaration, so a page that
     * tried would silently get the body face anyway.
     */
    textarea.mono {
      font-family: var(--font-mono);
    }
  `,
})
export class UiTextarea {
  readonly value = model('');
  readonly rows = input(3);
  readonly placeholder = input('');
  /** Monospace, for content read as columns rather than as prose. */
  readonly mono = input(false);

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }
}
