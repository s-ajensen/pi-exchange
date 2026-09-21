import { afterEach, beforeEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExchange } from "../../src/exchange.ts";

export function useExchange() {
  let dataDir: string;
  let time: number;
  let handle: ReturnType<typeof createExchange>;
  const now = () => new Date(time);
  function restart() {
    handle = createExchange({ dataDir, secret: "secret", ttlSeconds: 30, now });
  }
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "pi-exchange-spec-"));
    time = Date.parse("2026-01-01T00:00:00Z");
    restart();
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });
  function request(path: string, body?: unknown, authorization = "Bearer secret") {
    return handle(new Request(`http://exchange${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
  }
  return {
    request,
    restart,
    handle: (request: Request) => handle(request),
    advance: (milliseconds: number) => { time += milliseconds; },
    get dataDir() { return dataDir; },
  };
}

export function makeJoin(address = "alice@home", session = "/sessions/alice") {
  return { address, host: "home", cwd: "/work", sessionName: "Alice", session };
}
