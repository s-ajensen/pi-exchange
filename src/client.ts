import type {
	AckRequest, ErrorResponse, HealthResponse, HeartbeatRequest, JoinRequest, JoinResponse,
	LeaveRequest, MailQuery, MailResponse, PeersResponse, SendRequest, SendResponse, SuccessResponse,
} from "../server/src/protocol.ts";
import type { Config } from "./config.ts";

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type Client = ReturnType<typeof createClient>;

export class ResponseError extends Error {
	constructor(public status: number, text: string) {
		super(text);
	}
}

async function request<T>(config: Config, fetch: Fetch, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
	const response = await fetch(new URL(path, config.server), {
		method: body === undefined ? "GET" : "POST",
		headers: { Authorization: `Bearer ${config.secret}`, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body), signal,
	});
	if (!response.ok) {
		const data = await response.json() as ErrorResponse;
		throw new ResponseError(response.status, data.error);
	}
	return response.json() as Promise<T>;
}

export function getHealth(config: Config, fetch: Fetch, signal?: AbortSignal): Promise<HealthResponse> {
	return request(config, fetch, "/health", undefined, signal);
}

export function joinPeer(config: Config, fetch: Fetch, body: JoinRequest, signal?: AbortSignal): Promise<JoinResponse> {
	return request(config, fetch, "/join", body, signal);
}

export function heartbeatPeer(config: Config, fetch: Fetch, body: HeartbeatRequest, signal?: AbortSignal): Promise<SuccessResponse> {
	return request(config, fetch, "/heartbeat", body, signal);
}

export function leavePeer(config: Config, fetch: Fetch, body: LeaveRequest, signal?: AbortSignal): Promise<SuccessResponse> {
	return request(config, fetch, "/leave", body, signal);
}

export function getPeers(config: Config, fetch: Fetch, signal?: AbortSignal): Promise<PeersResponse> {
	return request(config, fetch, "/peers", undefined, signal);
}

export function sendMail(config: Config, fetch: Fetch, body: SendRequest, signal?: AbortSignal): Promise<SendResponse> {
	return request(config, fetch, "/send", body, signal);
}

export function getMail(config: Config, fetch: Fetch, query: MailQuery, signal?: AbortSignal): Promise<MailResponse> {
	const params = new URLSearchParams({ address: query.address });
	if (query.after !== undefined) {
		params.set("after", String(query.after));
	}
	if (query.wait !== undefined) {
		params.set("wait", String(query.wait));
	}
	return request(config, fetch, `/mail?${params}`, undefined, signal);
}

export function acknowledgeMail(config: Config, fetch: Fetch, body: AckRequest, signal?: AbortSignal): Promise<SuccessResponse> {
	return request(config, fetch, "/ack", body, signal);
}

export function createClient(config: Config, fetch: Fetch) {
	return {
		health: (signal?: AbortSignal) => getHealth(config, fetch, signal),
		join: (body: JoinRequest, signal?: AbortSignal) => joinPeer(config, fetch, body, signal),
		heartbeat: (body: HeartbeatRequest, signal?: AbortSignal) => heartbeatPeer(config, fetch, body, signal),
		leave: (body: LeaveRequest, signal?: AbortSignal) => leavePeer(config, fetch, body, signal),
		peers: (signal?: AbortSignal) => getPeers(config, fetch, signal),
		send: (body: SendRequest, signal?: AbortSignal) => sendMail(config, fetch, body, signal),
		mail: (query: MailQuery, signal?: AbortSignal) => getMail(config, fetch, query, signal),
		ack: (body: AckRequest, signal?: AbortSignal) => acknowledgeMail(config, fetch, body, signal),
	};
}
