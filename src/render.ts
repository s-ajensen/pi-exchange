import { getMarkdownTheme, type MessageRenderOptions } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import type { ExchangeMessage } from "./deliver.ts";

export type Paint = {
	fg(color: "accent" | "toolTitle", text: string): string;
	bold(text: string): string;
};
type Call = { action?: string; name?: string; to?: string[]; text?: string };

function buildTitledBlock(title: string, body: string, paint: Paint): Container {
	const container = new Container();
	container.addChild(new Text(paint.bold(title), 0, 0));
	if (body !== "") {
		container.addChild(new Markdown(body, 1, 0, getMarkdownTheme()));
	}
	return container;
}

export function renderExchangeMessage(message: ExchangeMessage, _options: MessageRenderOptions, paint: Paint): Container {
	return buildTitledBlock(paint.fg("accent", `${message.details.from} says`), message.details.text, paint);
}

export function renderExchangeCall(args: Call, paint: Paint): Container {
	const title = ["exchange", args.action].filter(Boolean).join(" ");
	const body = [args.name, args.to?.join(", "), args.text].filter(Boolean).join("\n\n");
	return buildTitledBlock(paint.fg("toolTitle", title), body, paint);
}
