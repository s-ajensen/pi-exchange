import { expect, test } from "bun:test";
import { makeJoin, useExchange } from "./helpers/exchange.ts";

const exchange = useExchange();

test("rejects an unknown heartbeat", async () => {
  expect((await exchange.request("/heartbeat", { address: "alice@home" })).status).toBe(404);
});

test("rejects another session while an address is online without changing its presence", async () => {
  await exchange.request("/join", makeJoin());
  expect((await exchange.request("/join", makeJoin("alice@home", "/other"))).status).toBe(409);
  expect((await exchange.request("/join", makeJoin())).status).toBe(200);
});

test("starts with no peers", async () => {
  expect(await (await exchange.request("/peers")).json()).toEqual([]);
});

test("joins and lists public metadata without the session path", async () => {
  const response = await exchange.request("/join", makeJoin());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ address: "alice@home" });
  expect(await (await exchange.request("/peers")).json()).toEqual([{
    address: "alice@home", host: "home", cwd: "/work", sessionName: "Alice",
    online: true, lastSeen: "2026-01-01T00:00:00.000Z",
  }]);
});

test("keeps offline peers and allows takeover exactly at the TTL boundary", async () => {
  await exchange.request("/join", makeJoin());
  exchange.advance(30_000);
  expect((await (await exchange.request("/peers")).json())[0].online).toBe(false);
  expect((await exchange.request("/join", makeJoin("alice@home", "/other"))).status).toBe(200);
});

test("refreshes presence on same-session join and heartbeat, including an offline peer", async () => {
  await exchange.request("/join", makeJoin());
  exchange.advance(29_000);
  await exchange.request("/join", makeJoin());
  exchange.advance(29_000);
  expect((await (await exchange.request("/peers")).json())[0].online).toBe(true);
  exchange.advance(1_000);
  expect((await exchange.request("/heartbeat", { address: "alice@home" })).status).toBe(200);
  exchange.advance(29_000);
  expect((await (await exchange.request("/peers")).json())[0]).toMatchObject({
    online: true, lastSeen: "2026-01-01T00:00:59.000Z",
  });
});

test("leaves idempotently and removes the peer", async () => {
  await exchange.request("/join", makeJoin());
  for (let i = 0; i < 2; i++) {
    expect((await exchange.request("/leave", { address: "alice@home" })).status).toBe(200);
  }
  expect(await (await exchange.request("/peers")).json()).toEqual([]);
});

test("forgets presence after restart and asks clients to rejoin", async () => {
  await exchange.request("/join", makeJoin());
  exchange.restart();
  expect(await (await exchange.request("/peers")).json()).toEqual([]);
  expect((await exchange.request("/heartbeat", { address: "alice@home" })).status).toBe(404);
});
