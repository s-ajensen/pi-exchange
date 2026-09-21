import { afterEach, beforeEach, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "../src/client.ts";
import { loadExchange } from "./helpers/load-extension.ts";
import { startServer } from "./helpers/server.ts";

let server: Awaited<ReturnType<typeof startServer>>;
let loaded: Awaited<ReturnType<typeof loadExchange>>;
let previous: string | undefined;
let branch: unknown[];
let widgets: unknown[];
let notices: unknown[];

function createContext() {
	return { cwd: "/work", hasUI: true, sessionManager: {
		getBranch: () => branch, getSessionFile: () => "/session.jsonl", getSessionId: () => "id",
	}, ui: { setWidget: (key: string, lines: unknown) => { widgets.push({ key, lines }); },
		notify: (text: string, level: string) => { notices.push({ text, level }); } } };
}

async function emit(event: "session_start" | "session_shutdown" | "resources_discover") {
	return loaded?.extension.handlers.get(event)?.[0]?.({ type: event, reason: "startup", cwd: "/work" } as never, createContext() as never);
}

beforeEach(async () => {
	server = await startServer();
	previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = server.dataDir;
	await writeFile(join(server.dataDir, "exchange.json"), JSON.stringify(server.config));
	branch = []; widgets = []; notices = [];
	loaded = await loadExchange(server.dataDir);
});
afterEach(async () => {
	try {
		await emit("session_shutdown");
	} finally {
		await server.dispose();
		if (previous === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = previous;
		}
	}
});

test("shows startup conflicts as warnings without changing persisted state", async () => {
	branch = [{ type: "custom", customType: "exchange", data: { joined: true, address: "a@h" } }];
	await createClient(server.config, fetch).join({ address: "a@h", host: "h", cwd: "/", sessionName: "other", session: "/other" });
	await emit("session_start");
	expect(notices).toEqual([{ text: 'The address "a@h" is already online from another session. Join again with a different name.', level: "warning" }]);
	expect(loaded.entries).toEqual([]);
	expect(widgets.at(-1)).toEqual({ key: "exchange", lines: undefined });
});

test("registers only exchange, its message renderer, and its skill", async () => {
	expect([...loaded.extension.tools.keys()]).toEqual(["exchange"]);
	expect(loaded.extension.messageRenderers.has("exchange_message")).toBe(true);
	expect(loaded.extension.commands.size).toBe(0);
	expect(await emit("resources_discover")).toEqual({ skillPaths: [join(new URL("..", import.meta.url).pathname, "skills")] });
});

test("starts unjoined without consulting config", async () => {
	await writeFile(join(server.dataDir, "exchange.json"), "invalid");
	await emit("session_start");
	expect(server.requests).toEqual([]);
	expect(notices).toEqual([]);
});

test("delivers incoming mail through the harness as a steer", async () => {
	branch = [{ type: "custom", customType: "exchange", data: { joined: true, address: "a@h" } }];
	await emit("session_start");
	await createClient(server.config, fetch).send({ from: "b@h", to: ["a@h"], text: "Question?" });
	const deadline = performance.now() + 500;
	while (loaded.sent.length === 0 && performance.now() < deadline) {
		await Bun.sleep(2);
	}
	expect(loaded.sent).toMatchObject([{ message: { content: 'Session "b@h" says:\n\nQuestion?' },
		options: { deliverAs: "steer", triggerTurn: true } }]);
});

test("restores persisted membership and preserves it through shutdown", async () => {
	branch = [{ type: "custom", customType: "exchange", data: { joined: true, address: "a@h" } }];
	await emit("session_start");
	expect(widgets.at(-1)).toEqual({ key: "exchange", lines: ["exchange  a@h"] });
	expect(await createClient(server.config, fetch).peers()).toMatchObject([{ address: "a@h" }]);
	await emit("session_shutdown");
	expect(await createClient(server.config, fetch).peers()).toEqual([]);
	expect(widgets.at(-1)).toEqual({ key: "exchange", lines: undefined });
	expect(loaded.entries).toEqual([]);
});
