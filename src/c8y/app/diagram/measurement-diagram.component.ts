/**
 * The customer's own configuration, drawn the way the explainer draws its
 * worked example: readings on the left, envelopes on the right.
 *
 * The visual grammar is doing the review. A wide accent envelope holding four
 * readings is obviously earning its keep; a thin outlined one holding a single
 * reading is obviously paying full price for it. Nobody has to read a table to
 * see which is which.
 *
 * The geometry is `lib/diagram/measurement-layout.ts`, shared with the
 * standalone build and with the test that measures it. What is here is the
 * rendering, and one difference from the preact version: the whole picture is
 * assembled as a plain object first. An Angular template cannot compute
 * midpoints inline without recomputing them on every change detection pass, and
 * a `computed()` that returns the finished shapes is easier to read anyway.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import {
  DG,
  boxFor,
  canvasHeight,
  rowCentre,
  rowSpans,
  truncate,
} from '../../../../lib/diagram/measurement-layout.js';
import type { MeasurementView } from '../../../../lib/engine/index.js';
import { compact, duration, n } from '../../../../lib/format/index.js';
import type { T } from '../../../../lib/i18n/index.js';
import { LocaleService } from '../i18n/locale.service.js';
import { RichComponent } from '../i18n/rich.component.js';

interface Reading {
  key: string;
  y: number;
  name: string;
  unit: string;
}

interface Envelope {
  key: string;
  top: number;
  height: number;
  shared: boolean;
  stacked: boolean;
  fragmentName: string;
  wires: Array<{ key: number; d: string }>;
  /** The one-line form, for an envelope too short to stack. */
  compactRate: string;
  /** The stacked form. */
  timestampLine: string;
  messages: string;
}

/** "every 15 min", or the on-change phrase where there is no interval. */
function cadenceOf(t: T, seconds: number | undefined): string {
  return seconds === undefined
    ? t('diagram.onChange')
    : t('format.interval', { duration: duration(seconds) });
}

@Component({
  selector: 'c8y-mc-measurement-diagram',
  standalone: true,
  imports: [RichComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view().groups.length > 0) {
      <div class="mc-diagram">
        <svg [attr.viewBox]="'0 0 ' + DG.width + ' ' + height()" role="img" [attr.aria-label]="alt()">
          <text [attr.x]="DG.labelX" y="13" class="dg-cap">{{ label('diagram.everyReading') }}</text>
          <text [attr.x]="DG.boxX" y="13" class="dg-cap">{{ label('diagram.travelsIn') }}</text>

          @for (reading of readings(); track reading.key) {
            <g>
              <rect
                [attr.x]="DG.labelX"
                [attr.y]="reading.y - 13"
                [attr.width]="DG.labelW"
                height="26"
                rx="13"
                class="dg-sensor"
              />
              <circle [attr.cx]="DG.labelX + 15" [attr.cy]="reading.y" r="4" class="dg-dot" />
              <text [attr.x]="DG.labelX + 27" [attr.y]="reading.y + 4" class="dg-label">
                {{ reading.name }}
                @if (reading.unit) {
                  <tspan class="dg-unit"> {{ reading.unit }}</tspan>
                }
              </text>
            </g>
          }

          <!-- Whatever the row budget could not draw, said out loud. -->
          @for (more of overflow(); track more.key) {
            <text [attr.x]="DG.labelX + 27" [attr.y]="more.y + 4" class="dg-more">{{ more.text }}</text>
          }

          @for (box of envelopes(); track box.key) {
            <g>
              @for (wire of box.wires; track wire.key) {
                <path [attr.d]="wire.d" class="dg-wire" />
              }
              <rect
                [attr.x]="DG.boxX"
                [attr.y]="box.top"
                [attr.width]="DG.boxW"
                [attr.height]="box.height"
                rx="9"
                [attr.class]="box.shared ? 'dg-msg' : 'dg-msg-solo'"
              />
              @if (box.stacked) {
                <text [attr.x]="DG.boxX + 16" [attr.y]="box.top + 22" class="dg-frag">{{ box.fragmentName }}</text>
                <text [attr.x]="DG.boxX + 16" [attr.y]="box.top + 39" class="dg-rate">{{ box.timestampLine }}</text>
                <text [attr.x]="DG.boxX + DG.boxW - 12" [attr.y]="box.top + 26" class="dg-count" text-anchor="end">
                  {{ box.messages }}
                </text>
                <text [attr.x]="DG.boxX + DG.boxW - 12" [attr.y]="box.top + 40" class="dg-rate" text-anchor="end">
                  {{ label('diagram.msgPerMonth') }}
                </text>
              } @else {
                <text [attr.x]="DG.boxX + 16" [attr.y]="box.top + box.height / 2 + 4" class="dg-frag">
                  {{ box.fragmentName }}
                </text>
                <text
                  [attr.x]="DG.boxX + DG.boxW - 12"
                  [attr.y]="box.top + box.height / 2 + 4"
                  class="dg-rate"
                  text-anchor="end"
                >
                  {{ box.compactRate }}
                </text>
              }
            </g>
          }
        </svg>

        <div class="dg-legend">
          <span><i class="key shared"></i> {{ label('diagram.legend.shared') }}</span>
          <span><i class="key solo"></i> {{ label('diagram.legend.alone') }}</span>
          <span class="mc-spacer"></span>
          <c8y-mc-rich k="diagram.legend.total" [p]="totalParams()" />
          @if (saving() > 1) {
            <span class="mc-saves"><c8y-mc-rich k="diagram.legend.saving" [p]="savingParams()" /></span>
          }
        </div>
      </div>
    }
  `,
})
export class MeasurementDiagramComponent {
  private readonly locales = inject(LocaleService);
  protected readonly DG = DG;

  readonly view = input.required<MeasurementView>();

  private readonly spans = computed(() => rowSpans(this.view()));

  readonly height = computed(() => canvasHeight(this.view().rowCount));
  readonly saving = computed(() => this.view().naiveMessagesPerMonth - this.view().messagesPerMonth);

  readonly readings = computed<Reading[]>(() => {
    const t = this.locales.t();
    return this.spans().flatMap(({ group, from }) =>
      group.members.map((member, k) => ({
        key: member.metricId,
        y: rowCentre(from + k),
        name: truncate(member.name || t('diagram.unnamed'), 22),
        unit: member.unit ? truncate(member.unit, 8) : '',
      })),
    );
  });

  readonly overflow = computed(() => {
    const t = this.locales.t();
    return this.spans()
      .filter(({ group }) => group.hiddenMembers > 0)
      .map(({ group, to }) => ({
        key: group.id,
        y: rowCentre(to),
        text: t.plural('diagram.more', group.hiddenMembers),
      }));
  });

  readonly envelopes = computed<Envelope[]>(() => {
    const t = this.locales.t();
    return this.spans().map(({ group, from, to }) => {
      const { top, height } = boxFor(from, to);
      const drawn = to - from + 1;
      const cadence = cadenceOf(t, group.intervalSeconds);
      return {
        key: group.id,
        top,
        height,
        shared: group.shared,
        stacked: height >= DG.stackMinHeight,
        fragmentName: truncate(group.fragmentName, 26),
        wires: Array.from({ length: drawn }, (_, k) => {
          const y0 = rowCentre(from + k);
          const y1 = top + ((k + 0.5) * height) / drawn;
          return {
            key: k,
            d:
              `M ${DG.labelX + DG.labelW} ${y0} ` +
              `C ${DG.labelX + DG.labelW + 60} ${y0}, ${DG.boxX - 60} ${y1}, ${DG.boxX} ${y1}`,
          };
        }),
        compactRate: t('diagram.compact', {
          cadence,
          messages: compact(group.messagesPerMonth),
        }),
        timestampLine: t.plural('diagram.oneTimestamp', group.seriesCount, { cadence }),
        messages: compact(group.messagesPerMonth),
      };
    });
  });

  readonly alt = computed(() =>
    this.locales.t()('diagram.alt', {
      measurements: this.view().groups.length,
      readings: n(this.view().storedPerMonth),
      messages: n(this.view().messagesPerMonth),
    }),
  );

  readonly totalParams = computed(() => {
    // compact() formats through the locale; see contract.component.ts.
    this.locales.locale();
    return {
      messages: compact(this.view().messagesPerMonth),
      readings: compact(this.view().storedPerMonth),
    };
  });

  readonly savingParams = computed(() => {
    this.locales.locale();
    return { count: compact(this.saving()) };
  });

  label(key: Parameters<T>[0]): string {
    return this.locales.t()(key);
  }
}
