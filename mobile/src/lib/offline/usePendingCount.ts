import { useCallback, useEffect, useState } from 'react';
import { pendingCount } from './offline';

export function usePendingCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    setCount(await pendingCount());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await pendingCount();
      if (!cancelled) {
        setCount(c);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { count, refresh };
}
