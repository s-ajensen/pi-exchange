export function createQueue() {
  const pending = new Map<string, Promise<void>>();

  function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(() => {}, () => {});
    pending.set(key, tail);
    void tail.then(() => {
      if (pending.get(key) === tail) {
        pending.delete(key);
      }
    });
    return result;
  }

  return { run };
}
