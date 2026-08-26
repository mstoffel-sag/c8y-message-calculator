/** Small shared controls, so the step components stay about the wizard. */

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Choice as ChoiceOption } from '../../lib/presets/catalog.js';
import {
  DURATION_UNITS,
  splitDuration,
  toSeconds,
  type DurationUnit,
} from '../../lib/engine/duration.js';
import {
  cadenceToPeriod,
  periodToCadence,
  unitsForKind,
  type RateUnit,
} from '../../lib/engine/cadence.js';
import type { Cadence, MetricKind } from '../../lib/engine/types.js';

export function Num({
  label, value, onChange, min = 0, max, step = 1, width = '100%', title, suffix,
}: {
  label?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  width?: string;
  title?: string;
  suffix?: string;
}) {
  return (
    <label class="field" style={`width:${width}`} title={title}>
      {label && <span>{label}</span>}
      <span style="display:flex;align-items:center;gap:5px">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onInput={(e) => {
            const raw = Number((e.target as HTMLInputElement).value);
            const n = Number.isFinite(raw) ? raw : min;
            onChange(Math.min(max ?? Infinity, Math.max(min, n)));
          }}
        />
        {suffix && <em style="font-style:normal;color:var(--ink-faint);font-size:12px">{suffix}</em>}
      </span>
    </label>
  );
}

export function Txt({
  label, value, onChange, placeholder, width = '100%',
}: {
  label?: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  width?: string;
}) {
  return (
    <label class="field" style={`width:${width}`}>
      {label && <span>{label}</span>}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
    </label>
  );
}

export function Teach({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div class="teach">
      <b>{title}</b>
      <div>{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="empty">{children}</div>;
}

const OTHER = '\u0000other';

/**
 * The wizard's one input control: a dropdown of sensible values that can always
 * be escaped.
 *
 * Every datapoint column uses this, so a customer is never handed a blank box
 * and two people modelling the same fleet reach the same numbers. Picking
 * "Other" reveals a free field -- a catalogue that cannot be escaped is worse
 * than no catalogue -- and a value that is not in the list arrives showing that
 * field already open, so an imported scenario never silently snaps to a preset.
 */
export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  kind = 'text',
  width = '100%',
  title,
  placeholder,
  suffix,
  otherLabel = 'Other…',
  allowOther = true,
}: {
  label?: string;
  value: T;
  options: Array<ChoiceOption<T>>;
  onChange: (value: T) => void;
  /** How to read a custom entry back. */
  kind?: 'text' | 'number';
  width?: string;
  title?: string;
  placeholder?: string;
  suffix?: string;
  otherLabel?: string;
  /** Off for closed sets -- "Other" makes no sense for "which measurement". */
  allowOther?: boolean;
}) {
  const known = useMemo(() => options.some((o) => o.value === value), [options, value]);
  // Sticky: choosing "Other" keeps the field open even before anything is typed.
  const [forceCustom, setForceCustom] = useState(false);
  const custom = allowOther && (forceCustom || !known);

  const groups = useMemo(() => {
    const out: Array<{ group: string | undefined; items: Array<ChoiceOption<T>> }> = [];
    for (const option of options) {
      const last = out[out.length - 1];
      if (last && last.group === option.group) last.items.push(option);
      else out.push({ group: option.group, items: [option] });
    }
    return out;
  }, [options]);

  const read = (raw: string): T => (kind === 'number' ? (Number(raw) as T) : (raw as T));

  return (
    <label class="field" style={`width:${width}`} title={title}>
      {label && <span>{label}</span>}
      <select
        value={custom ? OTHER : String(value)}
        onChange={(e) => {
          const picked = (e.target as HTMLSelectElement).value;
          if (picked === OTHER) {
            setForceCustom(true);
            return;
          }
          setForceCustom(false);
          const option = options.find((o) => String(o.value) === picked);
          if (option) onChange(option.value);
        }}
      >
        {groups.map((group, gi) =>
          group.group ? (
            <optgroup key={`${group.group}-${gi}`} label={group.group}>
              {group.items.map((option) => (
                <option key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : (
            group.items.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))
          ),
        )}
        {allowOther && <option value={OTHER}>{otherLabel}</option>}
      </select>

      {custom && (
        <span style="display:flex;align-items:center;gap:5px;margin-top:4px">
          <input
            type={kind === 'number' ? 'number' : 'text'}
            step="any"
            min={kind === 'number' ? 0 : undefined}
            value={String(value ?? '')}
            placeholder={placeholder}
            onInput={(e) => onChange(read((e.target as HTMLInputElement).value))}
          />
          {suffix && <em style="font-style:normal;color:var(--ink-faint);font-size:12px">{suffix}</em>}
        </span>
      )}
    </label>
  );
}

/**
 * Type the number, pick the unit. The wizard's other input control.
 *
 * The unit is local state, not derived from the incoming value on every render.
 * That matters more than it looks: typing "0.5" with the unit on hours makes
 * 1800 seconds, which would re-derive as "30 min" and yank the dropdown out
 * from under the cursor mid-edit. The unit only re-derives when the value
 * arrives from somewhere else -- a preset, an import, an undo.
 *
 * The number is held as text for the same reason. "1." and "" are legal states
 * on the way to a real value, and a control that rewrites them as you type is
 * unusable.
 */
export function ValueUnit<U extends string>({
  label,
  value,
  unit,
  units,
  onChange,
  width = '100%',
  title,
  hint,
  prefix,
}: {
  label?: string;
  value: number;
  unit: U;
  units: readonly U[];
  onChange: (value: number, unit: U) => void;
  width?: string;
  title?: string;
  hint?: string;
  /** e.g. "every", shown inside the control. */
  prefix?: string;
}) {
  const [localUnit, setLocalUnit] = useState<U>(unit);
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    // Only when the incoming pair is not the one this control just produced.
    if (unit === localUnit && Math.abs(Number(text) - value) < 1e-9) return;
    setLocalUnit(unit);
    setText(String(value));
  }, [value, unit]);

  const push = (rawText: string, rawUnit: U) => {
    const parsed = Number(rawText);
    if (!Number.isFinite(parsed) || parsed <= 0) return; // mid-edit, leave it be
    onChange(parsed, rawUnit);
  };

  return (
    <label class="field" style={`width:${width}`} title={title}>
      {label && <span>{label}</span>}
      <span class="duration">
        {prefix && <em class="prefix">{prefix}</em>}
        <input
          type="number"
          min={0}
          step="any"
          value={text}
          onInput={(e) => {
            const next = (e.target as HTMLInputElement).value;
            setText(next);
            push(next, localUnit);
          }}
        />
        <select
          value={localUnit}
          onChange={(e) => {
            const next = (e.target as HTMLSelectElement).value as U;
            setLocalUnit(next);
            push(text, next);
          }}
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </span>
      {hint && <span class="hint" style="margin:3px 0 0;text-transform:none;letter-spacing:0">{hint}</span>}
    </label>
  );
}

/** A sampling interval, in seconds. */
export function Duration({
  seconds,
  onChange,
  units = DURATION_UNITS,
  ...rest
}: {
  seconds: number;
  onChange: (seconds: number) => void;
  units?: readonly DurationUnit[];
  label?: string;
  width?: string;
  title?: string;
  hint?: string;
  prefix?: string;
}) {
  const split = splitDuration(seconds);
  return (
    <ValueUnit
      {...rest}
      value={split.value}
      unit={split.unit}
      units={units}
      onChange={(value, unit) => onChange(toSeconds(value, unit))}
    />
  );
}

/**
 * How often something happens, asked as the period between occurrences -- the
 * same entry method as the sampling interval, because "every four hours" is a
 * sentence a customer can answer and "0.1666 per hour" is arithmetic.
 */
export function Every({
  cadence,
  kind,
  onChange,
  ...rest
}: {
  cadence: Cadence;
  kind: MetricKind;
  onChange: (next: Cadence) => void;
  label?: string;
  width?: string;
  title?: string;
  hint?: string;
}) {
  const period = cadenceToPeriod(cadence);
  const units = unitsForKind(kind);
  return (
    <ValueUnit
      {...rest}
      prefix="every"
      value={period.value}
      unit={period.unit}
      units={units}
      onChange={(value, unit) => onChange(periodToCadence(value, unit, cadence))}
    />
  );
}
