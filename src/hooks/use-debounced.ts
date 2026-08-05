import { useEffect, useState } from 'react';

/**
 * The value, once it has stopped changing for `delayMs`. Used on search inputs so the API sees a
 * query per pause in typing, not a query per keystroke.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
