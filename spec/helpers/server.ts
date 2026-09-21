import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExchange } from "../../server/src/exchange.ts";

async function releasePolls(requests: Request[], handle: (request: Request) => Promise<Response>) {
	const addresses = requests.map((request) => new URL(request.url))
		.filter((url) => url.pathname === "/mail").map((url) => url.searchParams.get("address")!);
	if (addresses.length > 0) {
		await handle(new Request("http://localhost/send", { method: "POST",
			headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
			body: JSON.stringify({ from: "cleanup@spec", to: [...new Set(addresses)], text: "Closing test server." }),
		}));
	}
}

export async function startServer() {
	const dataDir = await mkdtemp(join(tmpdir(), "exchange-server-"));
	let now = new Date();
	const requests: Request[] = [];
	const buildHandler = () => createExchange({ dataDir, secret: "secret", ttlSeconds: 30, now: () => now });
	let handle = buildHandler();
	const serve = (port: number) => Bun.serve({ port, fetch: (request) => {
		requests.push(request.clone());
		return handle(request);
	} });
	let server = serve(0);
	const port = server.port!;
	return {
		config: { server: `http://localhost:${server.port}`, secret: "secret" }, dataDir, requests,
		stop: () => server.stop(true),
		advance: (ms: number) => { now = new Date(now.getTime() + ms); },
		restart: async () => {
			await server.stop(true);
			handle = buildHandler();
			server = serve(port);
		},
		dispose: async () => {
			await releasePolls(requests, handle);
			await server.stop(true);
			await rm(dataDir, { recursive: true, force: true });
		},
	};
}
