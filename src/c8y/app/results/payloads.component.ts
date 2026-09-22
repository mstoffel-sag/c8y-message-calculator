/**
 * Payload design. CONCEPT.md section 7 -- what turns an estimate into an
 * implementation brief.
 *
 * Grouped by namespace, because measurement fragments, event types, alarm types
 * and inventory fragments are four separate namespaces. Listed flat they read
 * as one long list of fragments, which makes a well-modelled machine look far
 * more complicated than it is.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { payloadsFor, type PayloadNamespace } from '../../../../lib/engine/index.js';
import type { Key } from '../../../../lib/i18n/index.js';
import { CopyButtonComponent } from '../controls/copy-button.component.js';
import { LocaleService } from '../i18n/locale.service.js';
import { TPipe } from '../i18n/t.pipe.js';
import { ScenarioStore } from '../scenario.store.js';

const ORDER: PayloadNamespace[] = [
  'measurement fragment',
  'event type',
  'alarm type',
  'inventory fragment',
];

/** Each namespace's noun, singular and plural, and the paragraph that explains it. */
const NS_KEY: Record<PayloadNamespace, { one: Key; many: Key; blurb: Key }> = {
  'measurement fragment': {
    one: 'payload.ns.measurement',
    many: 'payload.ns.measurement.plural',
    blurb: 'payload.blurb.measurement',
  },
  'event type': {
    one: 'payload.ns.event',
    many: 'payload.ns.event.plural',
    blurb: 'payload.blurb.event',
  },
  'alarm type': {
    one: 'payload.ns.alarm',
    many: 'payload.ns.alarm.plural',
    blurb: 'payload.blurb.alarm',
  },
  'inventory fragment': {
    one: 'payload.ns.inventory',
    many: 'payload.ns.inventory.plural',
    blurb: 'payload.blurb.inventory',
  },
};

@Component({
  selector: 'c8y-mc-payloads',
  standalone: true,
  imports: [CopyButtonComponent, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (machines().length > 0) {
      <div class="mc-panel">
        <header>
          <h2>{{ 'payload.heading' | t }}</h2>
          <span class="mc-sub-label">{{ 'payload.sub' | t }}</span>
        </header>
        <div class="mc-body">
          @for (machine of machines(); track machine.key) {
            <div class="m-b-24">
              <h3 class="m-b-4">{{ machine.name }}</h3>
              <p class="mc-hint m-b-16">{{ machine.counts }}</p>

              @for (group of machine.groups; track group.key) {
                <div class="m-b-16">
                  <h4>{{ group.heading }}</h4>
                  <p class="mc-hint mc-help m-b-8">{{ group.blurb }}</p>

                  @for (example of group.items; track example.key) {
                    <div class="mc-payload">
                      <header>
                        <code class="mc-frag">{{ example.name }}</code>
                        <span class="mc-hint">{{ example.title }}</span>
                        <c8y-mc-copy
                          class="mc-spacer"
                          [label]="'payload.copy' | t"
                          [text]="example.body"
                        />
                      </header>
                      <code class="mc-path">{{ example.restPath }}</code>
                      <pre>{{ example.restBody }}</pre>
                      <p class="mc-payload-note">
                        <!-- The bold opener is the point of the panel, so it
                             has to hold when a measurement type is sent more
                             than once a tick. -->
                        <b>{{ example.cost }}</b>
                        {{ example.notes }}
                        <span class="mc-mono">{{ example.topic }}</span>
                      </p>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class PayloadsComponent {
  private readonly store = inject(ScenarioStore);
  private readonly locales = inject(LocaleService);

  readonly machines = computed(() => {
    const t = this.locales.t();
    const scenario = this.store.scenario();

    return scenario.machineTypes
      .map(machineType => {
        const examples = payloadsFor(machineType, scenario.settings.fragmentPrefix);
        const groups = ORDER.map(ns => ({
          ns,
          items: examples.filter(e => e.namespace === ns),
        })).filter(group => group.items.length > 0);

        return {
          key: machineType.id,
          name: machineType.name || t('machine.unnamed'),
          /** "3 measurement fragments", with the noun agreeing in both languages. */
          counts: groups
            .map(
              group =>
                `${group.items.length} ` +
                t(group.items.length === 1 ? NS_KEY[group.ns].one : NS_KEY[group.ns].many),
            )
            .join(' · '),
          groups: groups.map(group => ({
            key: group.ns,
            heading: t(NS_KEY[group.ns].many),
            blurb: t(NS_KEY[group.ns].blurb),
            items: group.items.map((example, i) => ({
              key: `${machineType.id}-${group.ns}-${i}`,
              name: example.name,
              title: example.titleKey ? t(example.titleKey, example.titleParams) : example.title,
              cost:
                example.types > 1
                  ? t('payload.messages', { count: example.types })
                  : t('payload.oneMessage'),
              restPath: example.restPath,
              restBody: example.restBody,
              body: () => example.restBody,
              notes: example.noteKeys.map(key => t(key, example.noteParams)).join(' '),
              topic: t('payload.mqttTopic', { topic: example.mqttTopic }),
            })),
          })),
        };
      })
      .filter(machine => machine.groups.length > 0);
  });
}
