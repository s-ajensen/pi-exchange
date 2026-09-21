import { expect, test } from "bun:test";
import { buildExchangeMessage, EXCHANGE_MESSAGE_TYPE } from "../src/deliver.ts";

test("builds a visible message with the sender and untouched text", () => {
	expect(EXCHANGE_MESSAGE_TYPE).toBe("exchange_message");
	expect(buildExchangeMessage({ from: "a@h", to: "b@h", seq: 3, at: "now", text: "First\nsecond" })).toEqual({
		customType: "exchange_message", content: 'Session "a@h" says:\n\nFirst\nsecond', display: true,
		details: { from: "a@h", seq: 3, at: "now", text: "First\nsecond" },
	});
});
