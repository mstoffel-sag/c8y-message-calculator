/**
 * Expert mode.
 *
 * The wizard's audience is a customer architect describing their machines, and
 * for them a page of raw JSON is noise at best and intimidating at worst. The
 * payloads are still the thing that turns an estimate into an implementation
 * brief -- they just belong to a different reader, so they hide behind a switch
 * rather than sitting in everybody's way.
 *
 * A viewer preference, not scenario data: it lives in localStorage and does not
 * travel with an exported scenario.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';

const KEY = 'c8y.message-calculator.expert';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    // Private windows and blocked site data both throw.
    return false;
  }
}

export function useExpert(): [boolean, (next: boolean) => void] {
  const [expert, setExpert] = useState(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, expert ? '1' : '0');
    } catch {
      // Losing the preference is not worth interrupting the session for.
    }
  }, [expert]);

  return [expert, useCallback((next: boolean) => setExpert(next), [])];
}
