import { expect, test } from "bun:test";
import { useExchange } from "./helpers/exchange.ts";

const exchange = useExchange();

test("rejects absent, malformed, unequal-length, and wrong equal-length credentials", async () => {
  for (const authorization of ["", "secret", "Basic secret", "Bearer x", "Bearer secrEt"]) {
    const response = await exchange.request("/peers", undefined, authorization);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  }
});

test("protects every route except health, including unknown routes", async () => {
  for (const path of ["/join", "/heartbeat", "/leave", "/peers", "/send", "/mail", "/ack", "/missing"]) {
    expect((await exchange.request(path, undefined, "")).status).toBe(401);
  }
});

test("accepts the exact bearer secret", async () => {
  expect((await exchange.request("/peers")).status).toBe(200);
});
