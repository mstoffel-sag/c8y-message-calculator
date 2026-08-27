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

const ORDER: PayloadNamespace[] = [
  'measurement fragment',
  'event type',
  'alarm type',
  'inventory fragment',
];

const BLURB: Record<PayloadNamespace, string> = {
  'measurement fragment':
    'One per interval bundle, plus one per state or flag. A state needs its own because two flags ' +
    'that change independently cannot share a fragment -- sending one would mean omitting the other, ' +
    'and that is the varying-shape problem again.',
  'event type': 'A separate namespace from measurements. Event types never collide with fragment names.',
  'alarm type': 'Also its own namespace. One type per condition, raised and cleared through its lifecycle.',
  'inventory fragment':
    'Fragments on the managed object. Separate again from measurement fragments, even where the name looks alike.',
};

export function Payloads({ scenario }: { scenario: Scenario }) {
  if (scenario.machineTypes.length === 0) return null;

  return (
    <section class="panel">
      <header>
        <h2>Payloads to hand the device team</h2>
        <span class="sub">Every name this design needs, and the JSON for each</span>
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
              <h3 style="margin-bottom:4px">{mt.name || 'Unnamed machine type'}</h3>
              <p class="hint" style="margin:0 0 12px">
                {counts
                  .map((g) => `${g.items.length} ${g.ns}${g.items.length === 1 ? '' : 's'}`)
                  .join(' · ')}
              </p>

              {counts.map((group) => (
                <div key={group.ns} style="margin-bottom:16px">
                  <h4>{group.ns}s</h4>
                  <p class="hint" style="margin:2px 0 8px;max-width:78ch">{BLURB[group.ns]}</p>
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
  return (
    <div class="payload">
      <header>
        <code class="frag">{example.name}</code>
        <span class="hint" style="margin:0">{example.title}</span>
        <CopyButton class="spacer" label="Copy" text={() => example.restBody} />
      </header>
      <code class="path">{example.restPath}</code>
      <pre>{example.restBody}</pre>
      <p style="margin:8px 0 0;font-size:12.5px;color:var(--ink-mute)">
        <b style="color:var(--ink)">1 message.</b> {example.note}{' '}
        <span style="font-family:var(--mono);font-size:11.5px">MQTT topic: {example.mqttTopic}</span>
      </p>
    </div>
  );
}
