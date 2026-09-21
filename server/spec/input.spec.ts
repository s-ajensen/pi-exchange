import { expect, test } from "bun:test";
import { readWait } from "../src/input.ts";
import { makeJoin, useExchange } from "./helpers/exchange.ts";

const exchange = useExchange();

test("rejects non-object JSON bodies", async () => {
  for (const body of [null, [], "text", 3]) {
    expect((await exchange.request("/join", body)).status).toBe(400);
  }
});

test("rejects invalid addresses on presence endpoints", async () => {
  for (const address of ["../escape", "a@b/c", "a", "@host", "name@", "a@b@c", "a b@c", "é@host", "a@b\n", "a@b\r", 7, null]) {
    for (const path of ["/join", "/heartbeat", "/leave"]) {
      const response = await exchange.request(path, { ...makeJoin(), address });
      expect(response.status).toBe(400);
      expect(await response.json()).toHaveProperty("error");
    }
  }
});

test("requires string join metadata", async () => {
  for (const field of ["host", "cwd", "sessionName", "session"]) {
    expect((await exchange.request("/join", { ...makeJoin(), [field]: null })).status).toBe(400);
  }
});

test("caps long polling at thirty seconds and preserves fractional waits", () => {
  expect(readWait("31")).toBe(30);
  expect(readWait("0.025")).toBe(0.025);
  expect(readWait(null)).toBe(0);
});

test("accepts all address characters allowed by the protocol and opaque session paths", async () => {
  const response = await exchange.request("/join", makeJoin("A.1_2-3@B.4_5-6", "opaque: value"));
  expect(response.status).toBe(200);
});
