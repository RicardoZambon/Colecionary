import { Pipe, PipeTransform } from '@angular/core';

/** Formats USD amounts the way the design does: `$4,200`. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return '$' + Number(value ?? 0).toLocaleString('en-US');
  }
}
