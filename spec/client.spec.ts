import { afterEach, beforeEach, expect, test } from "bun:test";
import { createClient, getHealth, getPeers } from "../src/client.ts";
import { startServer } from "./helpers/server.ts";

let server: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { await server.dispose(); });

const info = { address: "a@h", host: "h", cwd: "/work", sessionName: "a", session: "/a.jsonl" };

test("preserves server status and error text", async () => {
	await expect(getPeers({ ...server.config, secret: "wrong" }, fetch)).rejects.toMatchObject({ status: 401, message: "unauthorized" });
	const client = createClient(server.config, fetch);
	await expect(client.heartbeat({ address: "a@h" })).rejects.toMatchObject({ status: 404, message: "unknown address" });
	await client.join(info);
	await expect(client.join({ ...info, session: "/other" })).rejects.toMatchObject({ status: 409, message: "address already online" });
});

test("cancels a long poll through the supplied signal", async () => {
	const client = createClient(server.config, fetch);
	const controller = new AbortController();
	const pending = client.mail({ address: "a@h", wait: 0.05 }, controller.signal);
	controller.abort();
	await expect(pending).rejects.toThrow();
});

test("serves health without valid credentials", async () => {
	expect(await getHealth({ ...server.config, secret: "wrong" }, fetch)).toEqual({ ok: true });
});

test("uses every endpoint with exact JSON and explicit mail offsets", async () => {
	const client = createClient(server.config, fetch);
	expect(await client.join(info)).toEqual({ address: "a@h" });
	expect(await client.heartbeat({ address: "a@h" })).toEqual({ ok: true });
	expect(await client.peers()).toMatchObject([{ address: "a@h", online: true, cwd: "/work" }]);
	expect(await client.send({ from: "b@h", to: ["a@h"], text: "hi" })).toEqual([{ to: "a@h", seq: 1, online: true }]);
	expect(await client.mail({ address: "a@h" })).toMatchObject([{ seq: 1, from: "b@h", to: "a@h", text: "hi" }]);
	expect(await client.mail({ address: "a@h", after: 1, wait: 0 })).toEqual([]);
	expect(await client.ack({ address: "a@h", upTo: 1 })).toEqual({ ok: true });
	expect(await client.mail({ address: "a@h" })).toEqual([]);
	expect(await client.leave({ address: "a@h" })).toEqual({ ok: true });
	expect(await client.peers()).toEqual([]);
});
