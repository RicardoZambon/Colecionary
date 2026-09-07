import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiCheckbox } from '../checkbox/checkbox';
import { UiDateInput } from '../date-input/date-input';
import { UiSelect } from '../select/select';
import { UiTextInput } from '../text-input/text-input';
import { UiTextarea } from '../textarea/textarea';
import { UiToggle } from '../toggle/toggle';
import { UiField } from './field';

/**
 * These are the invariants that regressed silently for a year: a label with no
 * `for`, a hint nothing announced, and no way to focus a revealed field. Each
 * is asserted through the rendered DOM, because the association is the DOM.
 */
@Component({
  imports: [UiField, UiTextInput],
  template: `
    <ui-field [label]="'Name'" [hint]="hint()" [error]="error()">
      <ui-text-input [(value)]="name" />
    </ui-field>
  `,
})
class TextHost {
  readonly name = signal('');
  readonly hint = signal('');
  readonly error = signal('');
  readonly input = viewChild.required(UiTextInput);
}

@Component({
  imports: [UiField, UiTextarea, UiSelect, UiCheckbox, UiToggle],
  template: `
    <ui-field [label]="'Notes'"><ui-textarea /></ui-field>
    <ui-field [label]="'Currency'"><ui-select [options]="[]" /></ui-field>
    <ui-field [label]="'Pick'"><ui-checkbox /></ui-field>
    <ui-field [label]="'Share'"><ui-toggle /></ui-field>
  `,
})
class EveryControlHost {}

@Component({
  imports: [UiField, UiTextInput],
  template: `
    <ui-field [label]="'Twins'">
      <ui-text-input />
      <ui-text-input />
    </ui-field>
  `,
})
class TwoControlHost {}

/**
 * A control *swapped* inside one field — the shape the item form takes when a
 * custom field's declared type differs between two groups and the group select
 * moves between them.
 */
@Component({
  imports: [UiField, UiDateInput, UiTextInput],
  template: `
    <ui-field [label]="'Released'">
      @if (asDate()) {
        <ui-date-input />
      } @else {
        <ui-text-input />
      }
    </ui-field>
  `,
})
class SwappedControlHost {
  readonly asDate = signal(false);
}

function render<T>(type: new () => T) {
  const fixture = TestBed.createComponent(type);
  fixture.detectChanges();
  return fixture;
}

describe('UiField', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('points the label at the control it wraps, so clicking it reaches the field', () => {
    const el = render(TextHost).nativeElement as HTMLElement;
    const label = el.querySelector('label') as HTMLLabelElement;
    const input = el.querySelector('input') as HTMLInputElement;

    expect(input.id).not.toBe('');
    expect(label.getAttribute('for')).toBe(input.id);
  });

  it('labels every control kind in the library, not only the text box', () => {
    const el = render(EveryControlHost).nativeElement as HTMLElement;
    // `ui-field > label`, not every label on the page: ui-checkbox wraps its
    // input in a label of its own to carry the 44px touch target, and that one
    // labels by containment rather than by `for`.
    const labels = [...el.querySelectorAll('ui-field > label')];
    const controls = [
      el.querySelector('textarea'),
      el.querySelector('select'),
      el.querySelector('input[type=checkbox]'),
      el.querySelector('[role=switch]'),
    ] as HTMLElement[];

    expect(controls.every(c => !!c && c.id !== '')).toBe(true);
    expect(labels.map(l => l.getAttribute('for'))).toEqual(controls.map(c => c.id));
  });

  it('announces the hint through aria-describedby rather than only drawing it', () => {
    const fixture = render(TextHost);
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-describedby')).toBe(null);

    fixture.componentInstance.hint.set('Leave empty to follow the account');
    fixture.detectChanges();

    const hintId = input.getAttribute('aria-describedby') as string;
    expect(el.querySelector(`#${hintId}`)?.textContent).toContain('follow the account');
  });

  it('marks the control invalid and points it at the error, which is a live region', () => {
    const fixture = render(TextHost);
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe(null);

    fixture.componentInstance.error.set('Give the item a name');
    fixture.detectChanges();

    expect(input.getAttribute('aria-invalid')).toBe('true');
    const errorId = input.getAttribute('aria-describedby') as string;
    const error = el.querySelector(`#${errorId}`) as HTMLElement;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain('Give the item a name');
  });

  it('describes the hint and the error together, so a refusal does not hide the note', () => {
    const fixture = render(TextHost);
    fixture.componentInstance.hint.set('dd/mm');
    fixture.componentInstance.error.set('Not a date');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect((input.getAttribute('aria-describedby') as string).split(' ')).toHaveLength(2);
  });

  it('gives a second control in one field its own id rather than a duplicate', () => {
    const el = render(TwoControlHost).nativeElement as HTMLElement;
    const [first, second] = [...el.querySelectorAll('input')];
    const label = el.querySelector('label') as HTMLLabelElement;

    expect(first.id).not.toBe(second.id);
    expect(label.getAttribute('for')).toBe(first.id);
  });

  it('lets a parent focus the control it revealed, which autofocus cannot do', () => {
    const fixture = render(TextHost);
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    fixture.componentInstance.input().focus();

    expect(document.activeElement).toBe(input);
  });

  it('follows the control when one is swapped inside the field', () => {
    // The minted id used to be claimed once and never released, so the label of
    // a field whose control is replaced kept naming the destroyed element:
    // clicking the label did nothing and the live control announced as unnamed.
    const fixture = render(SwappedControlHost);
    const el = fixture.nativeElement as HTMLElement;
    const resolves = () => {
      const label = el.querySelector('label') as HTMLLabelElement;
      const target = document.getElementById(label.getAttribute('for') as string);
      return target === el.querySelector('input');
    };

    expect(resolves()).toBe(true);

    fixture.componentInstance.asDate.set(true);
    fixture.detectChanges();
    expect(resolves()).toBe(true);

    fixture.componentInstance.asDate.set(false);
    fixture.detectChanges();
    expect(resolves()).toBe(true);
  });

  it('selects the existing text, for a box that opens on a value being replaced', () => {
    const fixture = render(TextHost);
    fixture.componentInstance.name.set('Bandai');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    fixture.componentInstance.input().selectAll();

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Bandai'.length);
  });
});
