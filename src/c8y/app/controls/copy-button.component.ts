/**
 * A button that copies something, and then says so.
 *
 * Every copy in this app goes through here, because the interesting part is not
 * the copying -- it is the two seconds afterwards. A button that changes nothing
 * when clicked reads as broken whether it worked or not, and the clipboard is
 * exactly the kind of thing that fails for reasons the reader cannot see.
 *
 * The standalone build says so on the button itself, because it has nowhere
 * else to say it. Here the shell's `ClipboardService` raises a toast, which is
 * where a Cumulocity user already looks for the result of an action -- so the
 * messages are ours and the channel is the platform's.
 */

import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ClipboardService, CoreModule } from '@c8y/ngx-components';

import { LocaleService } from '../i18n/locale.service.js';

@Component({
  selector: 'c8y-mc-copy',
  standalone: true,
  imports: [CoreModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="btn btn-default btn-sm" [title]="title() ?? ''" (click)="run()">
      <i c8yIcon="copy"></i>
      {{ label() }}
    </button>
  `,
})
export class CopyButtonComponent {
  private readonly clipboard = inject(ClipboardService);
  private readonly locales = inject(LocaleService);

  /** Computed on click, so a large payload is not built on every render. */
  readonly text = input.required<() => string>();
  readonly label = input.required<string>();
  readonly title = input<string>();

  run(): void {
    const t = this.locales.t();
    void this.clipboard.writeText(this.text()(), {
      success: t('copy.done'),
      error: t('copy.refused'),
    });
  }
}
