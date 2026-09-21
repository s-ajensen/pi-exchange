import { expect, test } from "bun:test";
import { createSignal } from "../src/signal.ts";

test("cancels a wait without resolving it or disturbing another wait", async () => {
  const signal = createSignal();
  const cancelled = signal.wait("address", 5);
  let resolved = false;
  void cancelled.promise.then(() => { resolved = true; });
  cancelled.cancel();
  cancelled.cancel();
  const active = signal.wait("address", 5);
  await active.promise;
  active.cancel();
  expect(resolved).toBe(false);
});

test("does not let repeated cancellation unregister later waits", async () => {
  const signal = createSignal();
  const cancelled = signal.wait("address", 500);
  cancelled.cancel();
  const active = signal.wait("address", 500);
  cancelled.cancel();
  const started = performance.now();
  signal.wake("address");
  await active.promise;
  active.cancel();
  expect(performance.now() - started).toBeLessThan(400);
});

test("times out without a wake", async () => {
  const started = performance.now();
  const waiting = createSignal().wait("address", 20);
  await waiting.promise;
  waiting.cancel();
  expect(performance.now() - started).toBeGreaterThanOrEqual(15);
  expect(performance.now() - started).toBeLessThan(500);
});

test("wakes all current waits for a key promptly", async () => {
  const signal = createSignal();
  const waits = [signal.wait("address", 500), signal.wait("address", 500)];
  const started = performance.now();
  signal.wake("address");
  await Promise.all(waits.map(wait => wait.promise));
  for (const wait of waits) wait.cancel();
  expect(performance.now() - started).toBeLessThan(400);
});

test("does not wake another key or retain a wake for future waits", async () => {
  const signal = createSignal();
  signal.wake("missing");
  const waiting = signal.wait("address", 20);
  let resolved = false;
  void waiting.promise.then(() => { resolved = true; });
  signal.wake("other");
  await Promise.resolve();
  expect(resolved).toBe(false);
  signal.wake("address");
  await waiting.promise;
  waiting.cancel();
  const next = signal.wait("address", 20);
  let nextResolved = false;
  void next.promise.then(() => { nextResolved = true; });
  await Promise.resolve();
  expect(nextResolved).toBe(false);
  signal.wake("address");
  await next.promise;
  next.cancel();
});
