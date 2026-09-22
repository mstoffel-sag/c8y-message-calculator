/**
 * Payload design. CONCEPT.md section 7 -- what turns an estimate into an
 * implementation brief.
 *
 * Grouped by namespace, because measurement fragments, event types, alarm types
 * and inventory fragments are four separate namespaces. Listed flat they read
 * as one long list of fragments, which makes a well-modelled machine look far
 * more complicated than it is.
 */

import {
  payloadsFor,
  type PayloadExample,
  type PayloadNamespace,
  type Scenario,
} from '../../lib/engine/index.js';
import { CopyButton } from './parts.js';
import { useT } from './i18n.js';
import type { Key, T } from '../../lib/i18n/index.js';

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

/** "3 measurement fragments", with the noun agreeing in both languages. */
function nsCount(t: T, ns: PayloadNamespace, count: number): string {
  return `${count} ${t(count === 1 ? NS_KEY[ns].one : NS_KEY[ns].many)}`;
}

export function Payloads({ scenario }: { scenario: Scenario }) {
  const t = useT();
  if (scenario.machineTypes.length === 0) return null;

  return (
    <section class="panel">
      <header>
        <h2>{t('payload.heading')}</h2>
        <span class="sub">{t('payload.sub')}</span>
      </header>
      <div class="body">
        {scenario.machineTypes.map((mt) => {
          const examples = payloadsFor(mt, scenario.settings.fragmentPrefix);
          if (examples.length === 0) return null;

          const counts = ORDER.map((ns) => ({
            ns,
            items: examples.filter((e) => e.namespace === ns),
          })).filter((g) => g.items.length > 0);

          return (
            <div key={mt.id} style="margin-bottom:22px">
              <h3 style="margin-bottom:4px">{mt.name || t('machine.unnamed')}</h3>
              <p class="hint" style="margin:0 0 12px">
                {counts.map((g) => nsCount(t, g.ns, g.items.length)).join(' · ')}
              </p>

              {counts.map((group) => (
                <div key={group.ns} style="margin-bottom:16px">
                  <h4>{t(NS_KEY[group.ns].many)}</h4>
                  <p class="hint" style="margin:2px 0 8px;max-width:78ch">{t(NS_KEY[group.ns].blurb)}</p>
                  {group.items.map((example, i) => (
                    <Example key={`${mt.id}-${group.ns}-${i}`} example={example} />
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Example({ example }: { example: PayloadExample }) {
  const t = useT();
  return (
    <div class="payload">
      <header>
        <code class="frag">{example.name}</code>
        <span class="hint" style="margin:0">
          {example.titleKey ? t(example.titleKey, example.titleParams) : example.title}
        </span>
        <CopyButton class="spacer" label={t('payload.copy')} text={() => example.restBody} />
      </header>
      <code class="path">{example.restPath}</code>
      <pre>{example.restBody}</pre>
      <p style="margin:8px 0 0;font-size:12.5px;color:var(--ink-mute)">
        {/* The bold opener is the point of the panel, so it has to hold when
            a measurement type is sent more than once a tick. */}
        <b style="color:var(--ink)">
          {example.types > 1
            ? t('payload.messages', { count: example.types })
            : t('payload.oneMessage')}
        </b>{' '}
        {example.noteKeys.map((key) => t(key, example.noteParams)).join(' ')}{' '}
        <span style="font-family:var(--mono);font-size:11.5px">
          {t('payload.mqttTopic', { topic: example.mqttTopic })}
        </span>
      </p>
    </div>
  );
}
