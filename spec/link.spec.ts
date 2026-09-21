import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createClient, type Fetch } from "../src/client.ts";
import { createLink, type Link, type LinkOptions } from "../src/link.ts";
import { startServer } from "./helpers/server.ts";

let server: Awaited<ReturnType<typeof startServer>>;
let links: Link[];
const info = { host: "h", cwd: "/work", sessionName: "a", session: "/a" };
beforeEach(async () => { server = await startServer(); links = []; });
afterEach(async () => {
	await Promise.allSettled(links.map((link) => link.leave()));
	await server.dispose();
});

async function waitUntil(check: () => boolean | Promise<boolean>) {
	const deadline = performance.now() + 500;
	while (!await check()) {
		if (performance.now() > deadline) {
			throw new Error("condition did not become true");
		}
		await Bun.sleep(2);
	}
}

function connect(options: Partial<LinkOptions> = {}, fetcher: Fetch = fetch) {
	const link = createLink({ client: createClient(server.config, fetcher), sendMessage: () => {},
		notify: () => {}, heartbeatMs: 20, pollWaitSeconds: 0.03, retryMs: 10, ...options });
	links.push(link);
	return link;
}

function countRequests(path: string) {
	return server.requests.filter((request) => new URL(request.url).pathname === path).length;
}

test("a conflicting join does not start loops", async () => {
	await createClient(server.config, fetch).join({ address: "a@h", ...info, session: "/other" });
	const link = connect();
	await expect(link.join("a@h", info)).rejects.toMatchObject({ status: 409 });
	expect(link.address()).toBeUndefined();
	expect(link.online()).toBe(false);
	expect(countRequests("/mail")).toBe(0);
});

test("retries delivery failures without acknowledging", async () => {
	let attempts = 0;
	const notices: (string | undefined)[] = [];
	const link = connect({ notify: (text) => { notices.push(text); }, sendMessage: () => {
		attempts++;
		if (attempts === 1) {
			throw new Error("delivery failed");
		}
	} });
	await createClient(server.config, fetch).send({ from: "b@h", to: ["a@h"], text: "hi" });
	await link.join("a@h", info);
	await waitUntil(() => countRequests("/ack") === 1);
	expect(attempts).toBe(2);
	expect(notices).toContain("delivery failed");
});

test("rejoins after server restart through heartbeat 404", async () => {
	const states: boolean[] = [];
	const link = connect({ notify: () => { states.push(link.online()); } });
	await link.join("a@h", info);
	await server.restart();
	await waitUntil(() => countRequests("/join") === 2);
	await waitUntil(() => link.online());
	expect(await createClient(server.config, fetch).peers()).toMatchObject([{ address: "a@h", online: true }]);
	expect(states).toContain(false);
});

test("marks offline during a network outage and recovers", async () => {
	const notices: (string | undefined)[] = [];
	const link = connect({ notify: (message) => { notices.push(message); } });
	await link.join("a@h", info);
	await server.stop();
	await waitUntil(() => !link.online());
	expect(link.address()).toBe("a@h");
	expect(notices.some((message) => message !== undefined)).toBe(true);
	await server.restart();
	await waitUntil(() => link.online());
	expect(await createClient(server.config, fetch).peers()).toMatchObject([{ address: "a@h", online: true }]);
});

test("warns only once across repeated outage failures and refreshes on recovery", async () => {
	let failures = 0;
	const notices: (string | undefined)[] = [];
	const fetcher: Fetch = async (input, init) => {
		try {
			return await fetch(input, init);
		} catch (error) {
			failures++;
			throw error;
		}
	};
	const link = connect({ notify: (message) => { notices.push(message); } }, fetcher);
	await link.join("a@h", info);
	await server.stop();
	await waitUntil(() => failures >= 6);
	expect(notices.filter((message) => message !== undefined)).toHaveLength(1);
	const count = notices.length;
	await server.restart();
	await waitUntil(() => link.online());
	expect(notices.length).toBeGreaterThan(count);
	expect(notices.at(-1)).toBeUndefined();
	expect(notices.filter((message) => message !== undefined)).toHaveLength(1);
});

test("retries a failed acknowledgment without delivering twice", async () => {
	const delivered: number[] = [];
	const notices: (string | undefined)[] = [];
	const cursor = join(server.dataDir, "cursor", "a@h:tmp");
	await mkdir(cursor, { recursive: true });
	const link = connect({ sendMessage: (message) => { delivered.push(message.details.seq); },
		notify: (message) => { notices.push(message); } });
	await createClient(server.config, fetch).send({ from: "b@h", to: ["a@h"], text: "hi" });
	await link.join("a@h", info);
	await waitUntil(() => notices.includes("internal server error"));
	await rm(cursor, { recursive: true });
	await waitUntil(async () => (await createClient(server.config, fetch).mail({ address: "a@h" })).length === 0);
	expect(delivered).toEqual([1]);
	expect(countRequests("/ack")).toBeGreaterThan(1);
});

test("heartbeats keep presence online beyond its original expiry", async () => {
	const link = connect();
	await link.join("a@h", info);
	server.advance(20000);
	await waitUntil(() => countRequests("/heartbeat") > 0);
	server.advance(15000);
	expect(await createClient(server.config, fetch).peers()).toMatchObject([{ address: "a@h", online: true }]);
	expect(link.address()).toBe("a@h");
	expect(link.online()).toBe(true);
});

test("delivers ordered steer messages before advancing the server cursor", async () => {
	const client = createClient(server.config, fetch);
	const delivered: unknown[] = [];
	let release!: () => void;
	const held = new Promise<void>((resolve) => { release = resolve; });
	const link = connect({ sendMessage: async (message, options) => {
		delivered.push({ message, options });
		await held;
	} });
	await client.send({ from: "b@h", to: ["a@h", "a@h"], text: "hi" });
	await link.join("a@h", info);
	await waitUntil(() => delivered.length === 1);
	expect(countRequests("/ack")).toBe(0);
	expect(await client.mail({ address: "a@h" })).toHaveLength(2);
	release();
	await waitUntil(async () => (await client.mail({ address: "a@h" })).length === 0);
	expect(delivered).toMatchObject([1, 2].map((seq) => ({ message: {
		customType: "exchange_message", content: 'Session "b@h" says:\n\nhi', details: { seq }, display: true,
	}, options: { deliverAs: "steer", triggerTurn: true } })));
});

test("drops duplicate sequences returned by a repeated HTTP read", async () => {
	let reads = 0;
	const fetcher: Fetch = async (input, init) => {
		const url = new URL(String(input));
		if (url.pathname === "/mail" && ++reads === 2) {
			url.searchParams.set("after", "0");
		}
		return fetch(url, init);
	};
	const delivered: number[] = [];
	const link = connect({ sendMessage: (message) => { delivered.push(message.details.seq); } }, fetcher);
	await createClient(server.config, fetch).send({ from: "b@h", to: ["a@h"], text: "hi" });
	await link.join("a@h", info);
	await waitUntil(() => reads >= 3);
	expect(delivered).toEqual([1]);
	expect(countRequests("/ack")).toBe(1);
});

test("leave aborts polling and stops all requests before resolving", async () => {
	const link = connect();
	await link.join("a@h", info);
	await waitUntil(() => countRequests("/mail") > 0);
	await link.leave();
	const count = server.requests.length;
	await Bun.sleep(50);
	expect(server.requests).toHaveLength(count);
	expect(countRequests("/leave")).toBe(1);
	expect(link.address()).toBeUndefined();
	expect(link.online()).toBe(false);
	await link.leave();
	expect(countRequests("/leave")).toBe(1);
});
