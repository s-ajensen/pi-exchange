import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig } from "../src/config.ts";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createPath() {
	const dir = await mkdtemp(join(tmpdir(), "exchange-config-"));
	dirs.push(dir);
	return join(dir, "exchange.json");
}

test("names the path and required keys when missing", async () => {
	const path = await createPath();
	await expect(readConfig(path)).rejects.toThrow(`${path}: expected JSON with server and secret`);
});

test.each(["{", "null", "{}", '{"server":4,"secret":"s"}', '{"server":"https://x","secret":""}', '{"server":"oops","secret":"s"}'])("rejects invalid config %s", async (text) => {
	const path = await createPath();
	await writeFile(path, text);
	await expect(readConfig(path)).rejects.toThrow(`${path}: expected JSON with server and secret`);
});

test("reads the supplied path", async () => {
	const path = await createPath();
	await writeFile(path, JSON.stringify({ server: "https://example.test", secret: "secret" }));
	expect(await readConfig(path)).toEqual({ server: "https://example.test", secret: "secret" });
});
