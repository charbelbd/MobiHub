import { useCallback, useRef, useState } from 'react';

/**
 * Prevents an async action (order submit, payment save, delete, etc.) from
 * running twice when a user double-clicks or double-taps a button before
 * the first request has finished.
 *
 * Usage:
 *   const [busy, guard] = useBusyGuard();
 *   const submit = guard(async (paid) => { ... });
 *   <button disabled={busy} onClick={() => submit(true)}>Submit</button>
 */
export function useBusyGuard() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const guard = useCallback((fn) => async (...args) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn(...args);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return [busy, guard];
}