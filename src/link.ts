import { setTimeout } from "node:timers/promises";
import type { JoinRequest, Message } from "../server/src/protocol.ts";
import { ResponseError, type Client } from "./client.ts";
import { buildExchangeMessage, type ExchangeMessage } from "./deliver.ts";

export type JoinInfo = Omit<JoinRequest, "address">;
export type LinkOptions = {
	client: Client;
	sendMessage(message: ExchangeMessage, options: { deliverAs: "steer"; triggerTurn: true }): void | Promise<void>;
	notify(message?: string): void;
	heartbeatMs?: number;
	pollWaitSeconds?: number;
	retryMs?: number;
};
export type Link = {
	join(address: string, info: JoinInfo): Promise<void>;
	leave(): Promise<void>;
	address(): string | undefined;
	online(): boolean;
};
type Settings = Required<LinkOptions>;

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
	try {
		await setTimeout(ms, undefined, { signal });
	} catch (error) {
		if (!signal.aborted) {
			throw error;
		}
	}
}

class Connection {
	readonly controller = new AbortController();
	connected = true;
	highestDelivered: number | undefined;
	acknowledged: number | undefined;
	tasks: Promise<void>[] = [];

	constructor(readonly request: JoinRequest, readonly settings: Settings) {}

	setOnline(online: boolean, error?: unknown): void {
		const message = this.connected && error !== undefined ? describeError(error) : undefined;
		this.connected = online;
		this.settings.notify(message);
	}

	async refresh(): Promise<void> {
		const { client } = this.settings;
		const { signal } = this.controller;
		try {
			await client.heartbeat({ address: this.request.address }, signal);
		} catch (error) {
			if (!(error instanceof ResponseError) || error.status !== 404) {
				throw error;
			}
			this.setOnline(false);
			await client.join(this.request, signal);
		}
		this.setOnline(true);
	}

	async acknowledge(): Promise<void> {
		if (this.highestDelivered === undefined || this.highestDelivered === this.acknowledged) {
			return;
		}
		await this.settings.client.ack({ address: this.request.address, upTo: this.highestDelivered }, this.controller.signal);
		this.acknowledged = this.highestDelivered;
	}

	async deliver(message: Message): Promise<void> {
		if (message.seq <= (this.highestDelivered ?? 0) || this.controller.signal.aborted) {
			return;
		}
		await this.settings.sendMessage(buildExchangeMessage(message), { deliverAs: "steer", triggerTurn: true });
		this.highestDelivered = message.seq;
		if (!this.controller.signal.aborted) {
			await this.acknowledge();
		}
	}

	async poll(): Promise<void> {
		await this.acknowledge();
		const messages = await this.settings.client.mail({
			address: this.request.address, after: this.highestDelivered, wait: this.settings.pollWaitSeconds,
		}, this.controller.signal);
		for (const message of messages.sort((a, b) => a.seq - b.seq)) {
			await this.deliver(message);
		}
	}

	async repeat(run: () => Promise<void>, interval: number): Promise<void> {
		const { signal } = this.controller;
		await wait(interval, signal);
		while (!signal.aborted) {
			let delay = interval;
			try {
				await run();
			} catch (error) {
				if (!signal.aborted) {
					this.setOnline(false, error);
				}
				delay = this.settings.retryMs;
			}
			await wait(delay, signal);
		}
	}

	start(): void {
		this.tasks = [this.repeat(() => this.refresh(), this.settings.heartbeatMs), this.repeat(() => this.poll(), 0)];
	}

	async stop(): Promise<void> {
		this.controller.abort();
		await Promise.all(this.tasks);
	}
}

class LinkState {
	connection: Connection | undefined;
	pending: Promise<unknown> = Promise.resolve();

	constructor(readonly settings: Settings) {}

	enqueue<T>(run: () => Promise<T>): Promise<T> {
		const result = this.pending.then(run, run);
		this.pending = result.catch(() => {});
		return result;
	}

	async join(address: string, info: JoinInfo): Promise<void> {
		await this.leave();
		const request = { ...info, address };
		await this.settings.client.join(request);
		this.connection = new Connection(request, this.settings);
		this.settings.notify();
		this.connection.start();
	}

	async leave(): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			return;
		}
		await connection.stop();
		this.connection = undefined;
		this.settings.notify();
		await this.settings.client.leave({ address: connection.request.address });
	}
}

export function createLink(options: LinkOptions): Link {
	const state = new LinkState({ heartbeatMs: 10000, pollWaitSeconds: 25, retryMs: 1000, ...options });
	return {
		join: (address, info) => state.enqueue(() => state.join(address, info)),
		leave: () => state.enqueue(() => state.leave()),
		address: () => state.connection?.request.address,
		online: () => state.connection?.connected ?? false,
	};
}
