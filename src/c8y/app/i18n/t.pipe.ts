/**
 * `{{ 'fleet.col.type' | t }}` -- the catalogue, in a template.
 *
 * Impure, and deliberately so. A pure pipe re-runs only when its arguments
 * change, and the thing that changes here is the session's locale, which is not
 * an argument to anything. `@ngx-translate`'s own `translate` pipe is impure for
 * the same reason. The cost is one string comparison per binding per change
 * detection pass, which is why each instance remembers its last answer.
 *
 * The key is typed: `Key` is a union of every key in `lib/i18n/en.ts`, so a
 * template that asks for a string nobody wrote does not compile.
 */

import { Pipe, inject, type PipeTransform } from '@angular/core';

import type { Key, Locale, Params, PluralBase } from '../../../../lib/i18n/index.js';
import { LocaleService } from './locale.service.js';

@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly locales = inject(LocaleService);
  private last?: { locale: Locale; key: Key; params: string; out: string };

  transform(key: Key, params?: Params): string {
    const locale = this.locales.locale();
    const fingerprint = params ? JSON.stringify(params) : '';
    if (
      this.last &&
      this.last.locale === locale &&
      this.last.key === key &&
      this.last.params === fingerprint
    ) {
      return this.last.out;
    }
    const out = this.locales.t()(key, params);
    this.last = { locale, key, params: fingerprint, out };
    return out;
  }
}

/** The same, for the keys that have `.one` / `.other` forms. */
@Pipe({ name: 'tPlural', pure: false })
export class TPluralPipe implements PipeTransform {
  private readonly locales = inject(LocaleService);

  transform(key: PluralBase, count: number, params?: Params): string {
    return this.locales.t().plural(key, count, params);
  }
}
