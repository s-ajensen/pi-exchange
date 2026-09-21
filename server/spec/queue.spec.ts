import { expect, test } from "bun:test";
import { createQueue } from "../src/queue.ts";

function createGate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

test("preserves task failures without blocking later work for the same key", async () => {
  const queue = createQueue();
  const failure = new Error("task failed");
  const first = queue.run("address", async () => { throw failure; });
  const second = queue.run("address", async () => 2);
  await expect(first).rejects.toBe(failure);
  expect(await second).toBe(2);
});

test("handles a synchronous throw without blocking later work", async () => {
  const queue = createQueue();
  const first = queue.run("address", () => { throw new Error("failed"); });
  await expect(first).rejects.toThrow("failed");
  expect(await queue.run("address", async () => 2)).toBe(2);
});

test("returns the task result", async () => {
  expect(await createQueue().run("address", async () => 42)).toBe(42);
});

test("runs tasks for the same key in insertion order", async () => {
  const queue = createQueue();
  const gate = createGate();
  const started = createGate();
  const events: string[] = [];
  const first = queue.run("address", async () => {
    events.push("first started");
    started.release();
    await gate.promise;
    events.push("first finished");
  });
  const second = queue.run("address", async () => { events.push("second"); });
  const third = queue.run("address", async () => { events.push("third"); });
  await started.promise;
  await Promise.resolve();
  expect(events).toEqual(["first started"]);
  gate.release();
  await Promise.all([first, second, third]);
  expect(events).toEqual(["first started", "first finished", "second", "third"]);
});

test("runs different keys independently", async () => {
  const queue = createQueue();
  const gate = createGate();
  const first = queue.run("first", () => gate.promise);
  expect(await queue.run("second", async () => "ready")).toBe("ready");
  gate.release();
  await first;
});
