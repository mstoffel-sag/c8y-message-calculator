/**
 * Which language the calculator speaks, and who decides.
 *
 * The shell decides. A Cumulocity user picks a language once, in their own
 * profile, and every application in the tenant follows it -- so this app has no
 * language switch of its own, unlike the standalone build, where there is
 * nothing else to ask. `TranslateService` is the shell's, from the SDK; the
 * words are ours, from `lib/i18n`.
 *
 * The catalogue has two languages and the shell has twelve. Anything that is
 * not German falls back to English rather than to a half-translated screen,
 * which is also what a tenant set to French gets from the SDK's own untranslated
 * strings.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { setFormatLocale } from '../../../../lib/format/index.js';
import { DEFAULT_LOCALE, isLocale, makeT, type Locale, type T } from '../../../../lib/i18n/index.js';

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly translate = inject(TranslateService);

  readonly locale = signal<Locale>(DEFAULT_LOCALE);

  /** A `t` bound to the session's locale. Rebuilt only when the locale moves. */
  readonly t = computed<T>(() => makeT(this.locale()));

  constructor() {
    this.follow(this.translate.getCurrentLang());
    this.translate.onLangChange
      .pipe(takeUntilDestroyed())
      .subscribe(event => this.follow(event.lang));
  }

  private follow(lang: string | undefined): void {
    const asked = (lang ?? '').slice(0, 2).toLowerCase();
    const next = isLocale(asked) ? asked : DEFAULT_LOCALE;
    this.locale.set(next);
    // Numbers are formatted by Intl rather than by the catalogue, so the
    // formatters have to be told separately -- 46,0 Mio. and 46.0 M differ in
    // more than the suffix.
    setFormatLocale(next);
  }
}
