export function createCoalescingThrottle<K, V>(
  emit: (key: K, value: V) => void,
  intervalMs: number,
): (key: K, value: V) => void {
  const pending = new Map<K, V>();
  const timers = new Map<K, ReturnType<typeof setTimeout>>();

  function scheduleWindow(key: K): void {
    const timer = setTimeout(() => {
      timers.delete(key);
      const next = pending.get(key);
      if (next === undefined) {
        return;
      }
      pending.delete(key);
      emit(key, next);
      scheduleWindow(key);
    }, intervalMs);
    timers.set(key, timer);
  }

  return function throttle(key: K, value: V): void {
    if (timers.has(key)) {
      pending.set(key, value);
      return;
    }
    emit(key, value);
    scheduleWindow(key);
  };
}
