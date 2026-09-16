/**
 * The catalogue's markup, as elements.
 *
 * `lib/i18n/rich.ts` turns `**bold**`, `*emphasis*` and `` `code` `` into
 * tokens; this turns tokens into DOM. Half the teaching in this tool is in the
 * bold -- *"one **POST** is **one message**"* -- so the marks have to survive
 * the trip out of the components and into a file a translator can retype.
 *
 * Two components because there are two shapes of string: one line with marks in
 * it, and several paragraphs. `display: contents` on the host keeps the inline
 * one inline, so a `<rich>` inside a sentence does not become a box.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  parseRich,
  parseRichProse,
  type Key,
  type Params,
} from '../../../../lib/i18n/index.js';
import { LocaleService } from './locale.service.js';

@Component({
  selector: 'c8y-mc-rich',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `@for (token of tokens(); track $index) {
    @switch (token.kind) {
      @case ('b') {<b>{{ token.text }}</b>}
      @case ('em') {<em>{{ token.text }}</em>}
      @case ('code') {<code>{{ token.text }}</code>}
      @default {{{ token.text }}}
    }
  }`
})
export class RichComponent {
  private readonly locales = inject(LocaleService);

  readonly k = input.required<Key>();
  readonly p = input<Params | undefined>(undefined);

  readonly tokens = computed(() => parseRich(this.locales.t()(this.k(), this.p())));
}

@Component({
  selector: 'c8y-mc-prose',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `@for (paragraph of paragraphs(); track $index) {
    <p>
      @for (token of paragraph; track $index) {
        @switch (token.kind) {
          @case ('b') {<b>{{ token.text }}</b>}
          @case ('em') {<em>{{ token.text }}</em>}
          @case ('code') {<code>{{ token.text }}</code>}
          @default {{{ token.text }}}
        }
      }
    </p>
  }`
})
export class ProseComponent {
  private readonly locales = inject(LocaleService);

  readonly k = input.required<Key>();
  readonly p = input<Params | undefined>(undefined);

  readonly paragraphs = computed(() => parseRichProse(this.locales.t()(this.k(), this.p())));
}
