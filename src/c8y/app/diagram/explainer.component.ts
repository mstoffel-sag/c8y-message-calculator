/**
 * The lesson the tool exists to teach. CONCEPT.md section 4.
 *
 * Drawn rather than written. The point -- that the same readings cost four
 * times as many messages when they travel separately -- is a shape, not a
 * sentence: four sensors feeding one envelope versus four. A JSON payload can
 * only make that point to somebody who already reads JSON, which is not the
 * person this screen is for.
 *
 * Interactive on purpose: the message count drops in front of the customer,
 * before they have entered anything.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import {
  CANVAS_HEIGHT,
  DAYS,
  INTERVAL,
  LAYOUT,
  MACHINES,
  SENDS,
  SERIES,
  boxFor,
  rowCentre,
} from '../../../../lib/diagram/explainer-layout.js';
import { compact, n } from '../../../../lib/format/index.js';
import type { Key } from '../../../../lib/i18n/index.js';
import { LocaleService } from '../i18n/locale.service.js';
import { ProseComponent, RichComponent } from '../i18n/rich.component.js';

interface Envelope {
  key: string;
  top: number;
  height: number;
  stacked: boolean;
  wires: Array<{ key: number; d: string }>;
  dots: Array<{ key: number; cx: number; cy: number }>;
  readingsLabel: string;
  dotsLabelX: number;
}

@Component({
  selector: 'c8y-mc-explainer',
  standalone: true,
  imports: [RichComponent, ProseComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="mc-panel mc-explain" open>
      <summary>{{ label('explain.summary') }}</summary>
      <div class="mc-body">
        <p class="mc-note"><c8y-mc-rich k="explain.note" /></p>

        <div class="mc-row mc-row-middle">
          <div class="form-group mc-slider">
            <label>{{ label('explain.slider') }}</label>
            <input
              type="range"
              class="form-control"
              min="1"
              max="4"
              step="1"
              [value]="perMessage()"
              (input)="perMessage.set(+$any($event.target).value)"
            />
          </div>
          <div class="mc-spacer"></div>
          <div class="mc-stat">
            <span>{{ label('explain.messages') }}</span>
            <b class="mc-accent">{{ messagesLabel() }}</b>
            <small>{{ messagesSub() }}</small>
          </div>
          <div class="mc-stat">
            <span>{{ label('explain.stored') }}</span>
            <b>{{ storedLabel() }}</b>
            <small>{{ label('explain.stored.sub') }}</small>
          </div>
        </div>

        <div class="mc-diagram">
          <svg [attr.viewBox]="'0 0 ' + LAYOUT.width + ' ' + height" role="img" [attr.aria-label]="alt()">
            <text [attr.x]="LAYOUT.sensorX" y="12" class="dg-cap">{{ label('explain.onTheMachine') }}</text>
            <text [attr.x]="LAYOUT.boxX" y="12" class="dg-cap">{{ label('explain.sentTo') }}</text>

            <!-- One pill per sensor reading. -->
            @for (sensor of sensors(); track sensor.name) {
              <g>
                <rect
                  [attr.x]="LAYOUT.sensorX"
                  [attr.y]="sensor.y - 15"
                  [attr.width]="LAYOUT.sensorW"
                  height="30"
                  rx="15"
                  class="dg-sensor"
                />
                <circle [attr.cx]="LAYOUT.sensorX + 16" [attr.cy]="sensor.y" r="4.5" class="dg-dot" />
                <text [attr.x]="LAYOUT.sensorX + 28" [attr.y]="sensor.y + 4" class="dg-label">
                  {{ sensor.short }}
                </text>
              </g>
            }

            @for (box of envelopes(); track box.key) {
              <g>
                <!-- Connectors, spread down the envelope's edge so none overlap. -->
                @for (wire of box.wires; track wire.key) {
                  <path [attr.d]="wire.d" class="dg-wire" />
                }

                <rect
                  [attr.x]="LAYOUT.boxX"
                  [attr.y]="box.top"
                  [attr.width]="LAYOUT.boxW"
                  [attr.height]="box.height"
                  rx="9"
                  class="dg-msg"
                />

                @if (box.stacked) {
                  <text [attr.x]="LAYOUT.boxX + 18" [attr.y]="box.top + 24" class="dg-msg-title">
                    {{ label('explain.oneMessage') }}
                  </text>
                  <text [attr.x]="LAYOUT.boxX + 18" [attr.y]="box.top + 41" class="dg-msg-sub">
                    {{ oneTimestampAt() }}
                  </text>
                  <!-- The readings inside, as dots: the payload without the syntax. -->
                  @for (dot of box.dots; track dot.key) {
                    <circle [attr.cx]="dot.cx" [attr.cy]="dot.cy" r="4.5" class="dg-dot" />
                  }
                  <text [attr.x]="box.dotsLabelX" [attr.y]="box.top + box.height - 14" class="dg-msg-sub">
                    {{ box.readingsLabel }}
                  </text>
                } @else {
                  <!-- A one-reading envelope is only 38 px tall, so the stacked
                       layout does not fit: everything goes on one line instead. -->
                  <text [attr.x]="LAYOUT.boxX + 18" [attr.y]="box.top + box.height / 2 + 4" class="dg-msg-title">
                    {{ label('explain.oneMessage') }}
                  </text>
                  <circle [attr.cx]="LAYOUT.boxX + 108" [attr.cy]="box.top + box.height / 2" r="4.5" class="dg-dot" />
                  <text [attr.x]="LAYOUT.boxX + 120" [attr.y]="box.top + box.height / 2 + 4" class="dg-msg-sub">
                    {{ oneReadingAt() }}
                  </text>
                }
              </g>
            }

            <!-- The running tally, in its own column so it can never crowd the
                 envelopes. Left-anchored: a right-anchored label grows leftwards
                 into them as the word turns plural. -->
            <text [attr.x]="LAYOUT.tallyX" [attr.y]="LAYOUT.top + 24" class="dg-total">{{ groups().length }}</text>
            <text [attr.x]="LAYOUT.tallyX" [attr.y]="LAYOUT.top + 40" class="dg-msg-sub">{{ tally() }}</text>
            <text [attr.x]="LAYOUT.tallyX" [attr.y]="LAYOUT.top + 54" class="dg-msg-sub">
              {{ label('explain.perTick') }}
            </text>
          </svg>
        </div>

        <div class="mc-grid mc-two">
          <div>
            <h4>{{ label('explain.picture.heading') }}</h4>
            <div class="mc-hint"><c8y-mc-prose k="explain.picture.body" /></div>
          </div>
          <div>
            <h4>{{ label('explain.rule.heading') }}</h4>
            <div class="mc-hint"><c8y-mc-prose k="explain.rule.body" /></div>
          </div>
        </div>
      </div>
    </details>
  `,
})
export class ExplainerComponent {
  private readonly locales = inject(LocaleService);

  protected readonly LAYOUT = LAYOUT;
  protected readonly height = CANVAS_HEIGHT;

  /**
   * Starts at one reading per measurement -- the way it gets built when nobody
   * thinks about it. Dragging right makes the number fall, which is the demo.
   */
  readonly perMessage = signal(1);

  readonly sensors = computed(() =>
    SERIES.map((series, i) => ({ name: series.name, short: series.short, y: rowCentre(i) })),
  );

  readonly groups = computed<number[][]>(() => {
    const out: number[][] = [];
    const per = this.perMessage();
    for (let i = 0; i < SERIES.length; i += per) {
      out.push(SERIES.map((_, j) => j).slice(i, i + per));
    }
    return out;
  });

  readonly envelopes = computed<Envelope[]>(() => {
    const t = this.locales.t();
    return this.groups().map((members, gi) => {
      const { top, height } = boxFor(members);
      const stacked = height >= LAYOUT.stackMinHeight;
      return {
        key: `g${gi}-${members.length}`,
        top,
        height,
        stacked,
        wires: members.map((m, k) => {
          const from = rowCentre(m);
          const to = top + ((k + 0.5) * height) / members.length;
          return {
            key: m,
            d:
              `M ${LAYOUT.sensorX + LAYOUT.sensorW} ${from} ` +
              `C ${LAYOUT.sensorX + LAYOUT.sensorW + 70} ${from}, ` +
              `${LAYOUT.boxX - 70} ${to}, ${LAYOUT.boxX} ${to}`,
          };
        }),
        dots: members.map((m, k) => ({
          key: m,
          cx: LAYOUT.boxX + 22 + k * 17,
          cy: top + height - 18,
        })),
        dotsLabelX: LAYOUT.boxX + 22 + members.length * 17 + 6,
        readingsLabel: t.plural('explain.readings', members.length),
      };
    });
  });

  // compact() formats through the locale; see contract.component.ts.
  readonly messagesLabel = computed(() => {
    this.locales.locale();
    return compact(SENDS * this.groups().length);
  });
  readonly storedLabel = computed(() => {
    this.locales.locale();
    return compact(SENDS * SERIES.length);
  });

  readonly messagesSub = computed(() =>
    this.locales.t()('explain.messages.sub', {
      machines: n(MACHINES),
      interval: INTERVAL,
      days: DAYS,
    }),
  );

  readonly alt = computed(() => this.locales.t().plural('explain.alt', this.groups().length));
  readonly tally = computed(() => this.locales.t().plural('explain.tally', this.groups().length));

  readonly oneTimestampAt = computed(() =>
    this.locales.t()('explain.oneTimestampAt', { time: '09:30:00' }),
  );
  readonly oneReadingAt = computed(() =>
    this.locales.t()('explain.oneReadingAt', { time: '09:30:00' }),
  );

  label(key: Key): string {
    return this.locales.t()(key);
  }
}
