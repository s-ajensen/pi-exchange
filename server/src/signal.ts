export function createSignal() {
  const readers = new Map<string, Set<() => void>>();

  function wait(key: string, milliseconds: number) {
    let resolve!: () => void;
    const promise = new Promise<void>(complete => {
      resolve = complete;
    });
    const listeners = readers.get(key) ?? new Set<() => void>();
    readers.set(key, listeners);
    listeners.add(resolve);
    const timer = setTimeout(resolve, milliseconds);

    function cancel() {
      clearTimeout(timer);
      listeners.delete(resolve);
      if (listeners.size === 0 && readers.get(key) === listeners) {
        readers.delete(key);
      }
    }

    return { promise, cancel };
  }

  function wake(key: string) {
    for (const resolve of readers.get(key) ?? []) {
      resolve();
    }
  }

  return { wait, wake };
}
