import { expect, test } from "bun:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { stripVTControlCharacters as stripAnsi } from "node:util";
import { buildExchangeMessage } from "../src/deliver.ts";
import { renderExchangeCall, renderExchangeMessage } from "../src/render.ts";

initTheme("dark");
const paint = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

test("renders an incomplete tool call without undefined text", () => {
	const text = renderExchangeCall({}, paint).render(80).map(stripAnsi).join("\n");
	expect(text.trim()).toBe("exchange");
});

test("renders the sender title and markdown body", () => {
	const message = buildExchangeMessage({ from: "a@h", to: "b@h", text: "**Hello**", seq: 1, at: "now" });
	const lines = renderExchangeMessage(message, { expanded: false, outputPad: 0 }, paint).render(80).map(stripAnsi);
	expect(lines[0]?.trimEnd()).toBe("a@h says");
	expect(lines.join("\n")).toContain("Hello");
	expect(lines.join("\n")).not.toContain("**Hello**");
});

test("renders tool action with recipients and text", () => {
	const text = renderExchangeCall({ action: "send", to: ["a@h", "b@h"], text: "hello" }, paint).render(80).map(stripAnsi).join("\n");
	expect(text).toContain("exchange send");
	expect(text).toContain("a@h, b@h");
	expect(text).toContain("hello");
});
