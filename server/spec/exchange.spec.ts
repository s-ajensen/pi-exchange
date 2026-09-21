import { expect, test } from "bun:test";
import { useExchange } from "./helpers/exchange.ts";

const exchange = useExchange();

test("returns a JSON 404 for unknown routes and unsupported methods", async () => {
  for (const response of [await exchange.request("/missing"), await exchange.request("/health", {})]) {
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  }
});

test("rejects malformed JSON", async () => {
  for (const path of ["/join", "/heartbeat", "/leave", "/send", "/ack"]) {
    const response = await exchange.handle(new Request(`http://exchange${path}`, {
      method: "POST", headers: { authorization: "Bearer secret" }, body: "{",
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  }
});

test("logs exactly method, path, and status for each request without query data", async () => {
  const module = new URL("../src/exchange.ts", import.meta.url).pathname;
  const script = `import { createExchange } from ${JSON.stringify(module)};
    const handle = createExchange({ dataDir: ${JSON.stringify(exchange.dataDir)}, secret: "secret", ttlSeconds: 30, now: () => new Date(0) });
    await handle(new Request("http://exchange/health?private=yes"));
    await handle(new Request("http://exchange/peers"));
    await handle(new Request("http://exchange/missing", { headers: { authorization: "Bearer secret" } }));`;
  const child = Bun.spawn([Bun.which("bun")!, "-e", script], { stdout: "pipe", stderr: "pipe" });
  expect(await child.exited).toBe(0);
  expect(await new Response(child.stdout).text()).toBe("GET /health 200\nGET /peers 401\nGET /missing 404\n");
  expect(await new Response(child.stderr).text()).toBe("");
});

test("serves health without authorization", async () => {
  const response = await exchange.request("/health", undefined, "");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});
