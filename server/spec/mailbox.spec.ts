import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { makeJoin, useExchange } from "./helpers/exchange.ts";

const exchange = useExchange();
const send = (text = "hello", to = ["bob@away"]) => exchange.request("/send", { from: "alice@home", to, text });
const read = (query = "") => exchange.request(`/mail?address=bob@away${query}`);

test("rejects invalid send fields and validates all recipients before writing", async () => {
  for (const body of [
    {}, { from: "invalid", to: ["bob@away"], text: "hi" },
    { from: "alice@home", to: "bob@away", text: "hi" },
    { from: "alice@home", to: ["bob@away", "../escape"], text: "hi" },
    { from: "alice@home", to: ["bob@away"], text: "" },
    { from: "alice@home", to: ["bob@away"], text: 4 },
  ]) expect((await exchange.request("/send", body)).status).toBe(400);
  expect(await (await read()).json()).toEqual([]);
});

test("rejects invalid mail addresses, offsets, and waits", async () => {
  for (const query of ["", "address=../escape", "address=bob@away&after=-1", "address=bob@away&after=1.5",
    "address=bob@away&after=NaN", "address=bob@away&after=", "address=bob@away&after=9007199254740992",
    "address=bob@away&wait=-1", "address=bob@away&wait=Infinity", "address=bob@away&wait=no"]) {
    expect((await exchange.request(`/mail?${query}`)).status).toBe(400);
  }
});

test("rejects invalid acknowledgments", async () => {
  for (const body of [{ address: "bad", upTo: 1 }, { address: "bob@away" },
    ...[-1, 0.1, "2", null].map(upTo => ({ address: "bob@away", upTo }))]) {
    expect((await exchange.request("/ack", body)).status).toBe(400);
  }
});

test("returns a JSON 500 when storage fails and lets other addresses continue", async () => {
  await mkdir(join(exchange.dataDir, "mail", "bob@away.jsonl"), { recursive: true });
  const module = new URL("../src/exchange.ts", import.meta.url).pathname;
  const script = `import { createExchange } from ${JSON.stringify(module)};
    const handle = createExchange({ dataDir: ${JSON.stringify(exchange.dataDir)}, secret: "secret", ttlSeconds: 30, now: () => new Date(0) });
    const results = [];
    for (const to of ["bob@away", "other@away"]) {
      const response = await handle(new Request("http://exchange/send", {
        method: "POST", headers: { authorization: "Bearer secret" },
        body: JSON.stringify({ from: "alice@home", to: [to], text: "hi" }),
      }));
      results.push({ status: response.status, body: await response.json() });
    }
    console.log(JSON.stringify(results));`;
  const child = Bun.spawn([Bun.which("bun")!, "-e", script], { stdout: "pipe", stderr: "pipe" });
  expect(await child.exited).toBe(0);
  const lines = (await new Response(child.stdout).text()).trim().split("\n");
  expect(lines.slice(0, 2)).toEqual(["POST /send 500", "POST /send 200"]);
  expect(JSON.parse(lines[2])).toEqual([
    { status: 500, body: { error: "internal server error" } },
    { status: 200, body: [{ to: "other@away", seq: 1, online: false }] },
  ]);
  const error = await new Response(child.stderr).text();
  expect(error).toContain("EISDIR");
  expect(error).toContain("illegal operation on a directory, read");
});

test("returns an empty mailbox for an unknown address", async () => {
  expect(await (await read()).json()).toEqual([]);
});

test("sends to offline recipients and persists the exact message before acknowledging", async () => {
  const response = await send();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([{ to: "bob@away", seq: 1, online: false }]);
  const message = { seq: 1, from: "alice@home", to: "bob@away", text: "hello", at: "2026-01-01T00:00:00.000Z" };
  expect(await readFile(join(exchange.dataDir, "mail", "bob@away.jsonl"), "utf8")).toBe(`${JSON.stringify(message)}\n`);
  expect(await (await read()).json()).toEqual([message]);
});

test("preserves recipient order and reports online and expired recipients", async () => {
  await exchange.request("/join", makeJoin("bob@away"));
  expect(await (await send("hello", ["other@away", "bob@away", "bob@away"])).json()).toEqual([
    { to: "other@away", seq: 1, online: false }, { to: "bob@away", seq: 1, online: true },
    { to: "bob@away", seq: 2, online: true },
  ]);
  exchange.advance(30_000);
  expect(await (await send()).json()).toEqual([{ to: "bob@away", seq: 3, online: false }]);
});

test("assigns distinct sequential numbers to concurrent sends", async () => {
  const responses = await Promise.all(Array.from({ length: 16 }, (_, i) => send(`${i}`)));
  const receipts = await Promise.all(responses.map(response => response.json()));
  expect(receipts.flat().map(receipt => receipt.seq).sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  const messages = await (await read()).json();
  expect(messages.map((message: { seq: number }) => message.seq)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
});

test("reads after an explicit offset without changing the cursor", async () => {
  await send("first");
  await send("second");
  expect((await (await read("&after=1")).json()).map((message: { text: string }) => message.text)).toEqual(["second"]);
  expect((await (await read()).json()).length).toBe(2);
});

test("persists an acknowledgment of zero for a new address", async () => {
  expect((await exchange.request("/ack", { address: "bob@away", upTo: 0 })).status).toBe(200);
  expect(await readFile(join(exchange.dataDir, "cursor", "bob@away"), "utf8")).toBe("0");
});

test("persists monotonic acknowledgments, including concurrent updates", async () => {
  await send();
  expect((await exchange.request("/ack", { address: "bob@away", upTo: 1 })).status).toBe(200);
  expect(await (await read()).json()).toEqual([]);
  await Promise.all([3, 2, 0, 1].map(upTo => exchange.request("/ack", { address: "bob@away", upTo })));
  expect(await readFile(join(exchange.dataDir, "cursor", "bob@away"), "utf8")).toBe("3");
  expect((await (await read("&after=0")).json()).length).toBe(1);
});

test("keeps cursor filenames distinct from temporary writes for every valid address", async () => {
  await exchange.request("/ack", { address: "bob@away.tmp", upTo: 9 });
  await exchange.request("/ack", { address: "bob@away", upTo: 1 });
  expect(await readFile(join(exchange.dataDir, "cursor", "bob@away.tmp"), "utf8")).toBe("9");
});

test("keeps mail and cursor across leave and restart and continues sequence numbers", async () => {
  await exchange.request("/join", makeJoin("bob@away"));
  await send();
  await exchange.request("/ack", { address: "bob@away", upTo: 1 });
  await exchange.request("/leave", { address: "bob@away" });
  exchange.restart();
  expect(await (await read()).json()).toEqual([]);
  expect((await (await read("&after=0")).json()).length).toBe(1);
  expect(await (await send("second")).json()).toEqual([{ to: "bob@away", seq: 2, online: false }]);
});

test("wakes every waiting reader promptly after an append", async () => {
  const started = performance.now();
  const pending = [read("&wait=0.5"), read("&wait=0.5")];
  await Bun.sleep(10);
  exchange.advance(1000);
  await send();
  for (const response of await Promise.all(pending)) {
    expect(await response.json()).toMatchObject([{ text: "hello", at: "2026-01-01T00:00:01.000Z" }]);
  }
  expect(performance.now() - started).toBeLessThan(400);
});

test("times out with an empty mailbox without advancing the injected presence clock", async () => {
  const started = performance.now();
  expect(await (await read("&wait=0.025")).json()).toEqual([]);
  expect(performance.now() - started).toBeGreaterThanOrEqual(20);
  expect(performance.now() - started).toBeLessThan(500);
});

test("keeps waiting when an append does not exceed the requested offset", async () => {
  const pending = read("&after=1&wait=0.2");
  await Bun.sleep(5);
  await send("first");
  await send("second");
  expect((await (await pending).json()).map((message: { seq: number }) => message.seq)).toEqual([2]);
});

test("returns existing mail immediately even when wait exceeds the cap", async () => {
  await send();
  const started = performance.now();
  expect((await (await read("&wait=999")).json()).length).toBe(1);
  expect(performance.now() - started).toBeLessThan(100);
});
