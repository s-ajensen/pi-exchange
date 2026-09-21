import { defineTool, type ExtensionContext, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import type { Peer, SendReceipt } from "../server/src/protocol.ts";
import { buildAddress, buildDefaultName } from "./address.ts";
import { ResponseError, type Client } from "./client.ts";
import type { JoinInfo, Link } from "./link.ts";
import { renderExchangeCall } from "./render.ts";
import { buildStateEntry, type JoinState } from "./state.ts";

export type ExchangeDeps = {
	connect(ctx: ExtensionContext): Promise<{ client: Client; link: Link }>;
	currentLink(): Link | undefined;
	hostname: string;
	getSessionName(): string | undefined;
	appendEntry(customType: string, data: JoinState): void;
};
const parameters = Type.Object({
	action: StringEnum(["join", "leave", "peers", "send"] as const),
	name: Type.Optional(Type.String()),
	to: Type.Optional(Type.Array(Type.String())),
	text: Type.Optional(Type.String()),
});
export type ExchangeInput = Static<typeof parameters>;

function describePresence(online: boolean): string {
	return online ? "online" : "offline";
}

function describePeer(peer: Peer): string {
	return `${peer.address}  ${describePresence(peer.online)}  ${peer.cwd}  ${peer.sessionName}`;
}

function describeReceipt(receipt: SendReceipt): string {
	return `${receipt.to}: queued (seq ${receipt.seq}, ${describePresence(receipt.online)})`;
}

export function describeConflict(address: string): string {
	return `The address "${address}" is already online from another session. Join again with a different name.`;
}

export function buildJoinInfo(deps: Pick<ExchangeDeps, "hostname" | "getSessionName">, ctx: ExtensionContext): JoinInfo {
	return { host: deps.hostname, cwd: ctx.cwd, sessionName: deps.getSessionName() ?? "",
		session: ctx.sessionManager.getSessionFile() ?? ctx.sessionManager.getSessionId() };
}

function appendState(deps: ExchangeDeps, address?: string): void {
	const entry = buildStateEntry(address);
	deps.appendEntry(entry.customType, entry.data);
}

async function joinExchange(deps: ExchangeDeps, params: ExchangeInput, ctx: ExtensionContext): Promise<string> {
	const name = params.name ?? buildDefaultName(deps.getSessionName(), ctx.sessionManager.getSessionFile());
	const address = buildAddress(name, deps.hostname);
	const { client, link } = await deps.connect(ctx);
	try {
		await link.join(address, buildJoinInfo(deps, ctx));
	} catch (error) {
		if (error instanceof ResponseError && error.status === 409) {
			return describeConflict(address);
		}
		throw error;
	}
	appendState(deps, address);
	const peers = (await client.peers()).filter((peer) => peer.address !== address && peer.online);
	return `Joined the exchange as "${address}". Peers online: ${peers.map((peer) => peer.address).join(", ") || "none"}.`;
}

async function leaveExchange(deps: ExchangeDeps): Promise<string> {
	const link = deps.currentLink();
	const address = link?.address();
	await link?.leave();
	appendState(deps);
	if (address === undefined) {
		return "Not joined to the exchange.";
	}
	return `Left the exchange. Messages sent to "${address}" wait on the server until you join again under that address.`;
}

async function listPeers(deps: ExchangeDeps, ctx: ExtensionContext): Promise<string> {
	const { client, link } = await deps.connect(ctx);
	const peers = (await client.peers()).filter((peer) => peer.address !== link.address());
	return peers.map(describePeer).join("\n") || "No peers.";
}

async function sendMessage(deps: ExchangeDeps, params: ExchangeInput, ctx: ExtensionContext): Promise<string> {
	const from = deps.currentLink()?.address();
	if (from === undefined) {
		return "Join the exchange before sending.";
	}
	if (params.to === undefined) {
		return "send requires to.";
	}
	if (params.text === undefined) {
		return "send requires text.";
	}
	const { client } = await deps.connect(ctx);
	return (await client.send({ from, to: params.to, text: params.text })).map(describeReceipt).join("\n");
}

async function executeAction(deps: ExchangeDeps, params: ExchangeInput, ctx: ExtensionContext): Promise<string> {
	switch (params.action) {
		case "join": return joinExchange(deps, params, ctx);
		case "leave": return leaveExchange(deps);
		case "peers": return listPeers(deps, ctx);
		case "send": return sendMessage(deps, params, ctx);
	}
}

async function executeSafely(deps: ExchangeDeps, params: ExchangeInput, ctx: ExtensionContext) {
	let text: string;
	try {
		text = await executeAction(deps, params, ctx);
	} catch (error) {
		text = error instanceof Error ? error.message : String(error);
	}
	return { content: [{ type: "text" as const, text }], details: undefined };
}

export function defineExchangeTool(deps: ExchangeDeps): ToolDefinition {
	let pending: Promise<unknown> = Promise.resolve();
	return defineTool({
		name: "exchange", label: "Exchange",
		description: "Talk to other pi sessions on the shared exchange. join opens this session under an address, leave closes it, peers lists sessions on the exchange, send queues text to one or more addresses. Replies from other sessions arrive later as messages.",
		promptGuidelines: ["Address peers by the exact address shown by peers or in the message header."],
		parameters,
		renderCall: (args, theme) => renderExchangeCall(args, theme),
		execute(_id, params, _signal, _onUpdate, ctx) {
			const run = () => executeSafely(deps, params, ctx);
			const result = pending.then(run, run);
			pending = result;
			return result;
		},
	}) as ToolDefinition;
}
