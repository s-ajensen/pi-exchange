import { expect, test } from "bun:test";
import { configure } from "../src/configuration.ts";

async function runConfiguration(environment: Record<string, string | undefined>) {
  const module = new URL("../src/configuration.ts", import.meta.url).pathname;
  const process = Bun.spawn([Bun.which("bun")!, "-e", `import { configure } from ${JSON.stringify(module)}; configure(${JSON.stringify(environment)});`], {
    stdout: "pipe", stderr: "pipe",
  });
  return { exitCode: await process.exited, stdout: await new Response(process.stdout).text(), stderr: await new Response(process.stderr).text() };
}

test("refuses missing and empty secrets with one stderr line and exit code one", async () => {
  for (const environment of [{}, { EXCHANGE_SECRET: "" }]) {
    expect(await runConfiguration(environment)).toEqual({ exitCode: 1, stdout: "", stderr: "EXCHANGE_SECRET is required\n" });
  }
});

test("refuses invalid ports and presence TTL values", async () => {
  for (const invalid of [{ PORT: "no" }, { PORT: "-1" }, { PORT: "65536" }, { PORT: "1.5" },
    { EXCHANGE_TTL_SECONDS: "0" }, { EXCHANGE_TTL_SECONDS: "NaN" }]) {
    const result = await runConfiguration({ EXCHANGE_SECRET: "secret", ...invalid });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
  }
});

test("uses the documented defaults", () => {
  expect(configure({ EXCHANGE_SECRET: "secret" })).toEqual({ secret: "secret", port: 8787, dataDir: "/data", ttlSeconds: 30 });
});

test("accepts explicit configuration including fractional TTL", () => {
  expect(configure({ EXCHANGE_SECRET: "other", PORT: "1234", EXCHANGE_DATA: "/tmp/mail", EXCHANGE_TTL_SECONDS: "0.5" }))
    .toEqual({ secret: "other", port: 1234, dataDir: "/tmp/mail", ttlSeconds: 0.5 });
});
