import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createClient } from "../src/client.ts";
import { defineExchangeTool, type ExchangeDeps } from "../src/exchange.ts";
import { createLink, type Link } from "../src/link.ts";
import { startServer } from "./helpers/server.ts";

let server: Awaited<ReturnType<typeof startServer>>;
let link: Link;
let deps: ExchangeDeps;
let entries: unknown[];
const ctx = { cwd: "/work", sessionManager: { getSessionFile: () => "/session.jsonl", getSessionId: () => "id" } } as ExtensionContext;
beforeEach(async () => {
	server = await startServer();
	const client = createClient(server.config, fetch);
	link = createLink({ client, sendMessage: () => {}, notify: () => {}, pollWaitSeconds: 0.02 });
	entries = [];
	deps = { connect: async () => ({ client, link }), currentLink: () => link, hostname: "host",
		getSessionName: () => "my session", appendEntry: (customType, data) => { entries.push({ customType, data }); } };
});
afterEach(async () => { await link.leave(); await server.dispose(); });

async function execute(params: unknown, tool: ToolDefinition = defineExchangeTool(deps)) {
	const result = await tool.execute("call", params, undefined, undefined, ctx);
	return result.content.map((part) => part.type === "text" ? part.text : "").join("\n");
}

test("returns config failures as text", async () => {
	deps.connect = async () => { throw new Error("/temp/exchange.json: expected JSON with server and secret"); };
	expect(await execute({ action: "join" })).toBe("/temp/exchange.json: expected JSON with server and secret");
});

test("refuses sends before joining without reading config", async () => {
	deps.connect = async () => { throw new Error("must not connect"); };
	expect(await execute({ action: "send", to: ["a@h"], text: "hi" })).toBe("Join the exchange before sending.");
});

test("requires to and text for send", async () => {
	await execute({ action: "join" });
	expect(await execute({ action: "send", text: "hi" })).toBe("send requires to.");
	expect(await execute({ action: "send", to: ["a@h"] })).toBe("send requires text.");
});

test("explains a conflicting address without appending state", async () => {
	await createClient(server.config, fetch).join({ address: "taken@host", host: "host", cwd: "/", sessionName: "other", session: "/other" });
	expect(await execute({ action: "join", name: "taken" })).toBe('The address "taken@host" is already online from another session. Join again with a different name.');
	expect(entries).toEqual([]);
});

test("joins with normalized defaults, excludes itself, and persists state", async () => {
	expect(await execute({ action: "join" })).toBe('Joined the exchange as "my-session@host". Peers online: none.');
	expect(entries).toEqual([{ customType: "exchange", data: { joined: true, address: "my-session@host" } }]);
	expect(await execute({ action: "peers" })).toBe("No peers.");
});

test("lists online and offline peers with exact metadata", async () => {
	const client = createClient(server.config, fetch);
	await client.join({ address: "old@h", host: "h", cwd: "/old", sessionName: "old", session: "/old" });
	server.advance(31000);
	await client.join({ address: "new@h", host: "h", cwd: "/new", sessionName: "new", session: "/new" });
	expect(await execute({ action: "join", name: "me" })).toBe('Joined the exchange as "me@host". Peers online: new@h.');
	expect((await execute({ action: "peers" })).split("\n").sort()).toEqual(["new@h  online  /new  new", "old@h  offline  /old  old"]);
});

test("returns every send receipt and persists explicit leave", async () => {
	await execute({ action: "join", name: "me" });
	expect(await execute({ action: "send", to: ["other@h"], text: "hi" })).toBe("other@h: queued (seq 1, offline)");
	expect(await execute({ action: "leave" })).toBe('Left the exchange. Messages sent to "me@host" wait on the server until you join again under that address.');
	expect(entries.at(-1)).toEqual({ customType: "exchange", data: { joined: false } });
	expect(link.address()).toBeUndefined();
});
