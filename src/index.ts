import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI, type ExtensionContext, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { createClient, ResponseError, type Client } from "./client.ts";
import { readConfig } from "./config.ts";
import { EXCHANGE_MESSAGE_TYPE, type ExchangeMessage } from "./deliver.ts";
import { buildJoinInfo, defineExchangeTool, describeConflict, type ExchangeDeps } from "./exchange.ts";
import { createLink, type Link } from "./link.ts";
import { renderExchangeMessage } from "./render.ts";
import { deriveJoinState } from "./state.ts";
import { renderWidgetLines } from "./widget.ts";

const SKILLS_DIR = fileURLToPath(new URL("../skills", import.meta.url));

class SessionConnection {
	connection: { client: Client; link: Link } | undefined;
	ui: ExtensionUIContext | undefined;

	constructor(readonly pi: ExtensionAPI) {}

	refresh(message?: string): void {
		const link = this.connection?.link;
		this.ui?.setWidget("exchange", renderWidgetLines(link?.address(), link?.online() ?? false));
		if (message !== undefined) {
			this.ui?.notify(message, "warning");
		}
	}

	async connect(ctx: ExtensionContext): Promise<{ client: Client; link: Link }> {
		this.ui = ctx.hasUI ? ctx.ui : undefined;
		if (!this.connection) {
			const client = createClient(await readConfig(join(getAgentDir(), "exchange.json")), fetch);
			const link = createLink({ client, sendMessage: (message, options) => this.pi.sendMessage(message, options),
				notify: (message) => this.refresh(message) });
			this.connection = { client, link };
		}
		return this.connection;
	}

	async restore(ctx: ExtensionContext, deps: ExchangeDeps): Promise<void> {
		this.ui = ctx.hasUI ? ctx.ui : undefined;
		this.refresh();
		const state = deriveJoinState(ctx.sessionManager.getBranch());
		if (!state.joined) {
			return;
		}
		try {
			const { link } = await this.connect(ctx);
			await link.join(state.address, buildJoinInfo(deps, ctx));
		} catch (error) {
			const message = error instanceof ResponseError && error.status === 409
				? describeConflict(state.address) : String(error instanceof Error ? error.message : error);
			this.refresh(message);
		}
	}

	async shutdown(): Promise<void> {
		try {
			await this.connection?.link.leave();
		} catch (error) {
			this.refresh(error instanceof Error ? error.message : String(error));
		}
		this.connection = undefined;
	}
}

export default function registerExchange(pi: ExtensionAPI): void {
	const session = new SessionConnection(pi);
	const deps: ExchangeDeps = {
		connect: (ctx) => session.connect(ctx), currentLink: () => session.connection?.link,
		hostname: hostname(), getSessionName: () => pi.getSessionName(),
		appendEntry: (customType, data) => pi.appendEntry(customType, data),
	};
	pi.registerTool(defineExchangeTool(deps));
	pi.registerMessageRenderer<ExchangeMessage["details"]>(EXCHANGE_MESSAGE_TYPE, (message, options, theme) =>
		renderExchangeMessage(message as ExchangeMessage, options, theme));
	pi.on("resources_discover", () => ({ skillPaths: [SKILLS_DIR] }));
	pi.on("session_start", (_event, ctx) => session.restore(ctx, deps));
	pi.on("session_shutdown", () => session.shutdown());
}
