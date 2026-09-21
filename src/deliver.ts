import type { Message } from "../server/src/protocol.ts";

export const EXCHANGE_MESSAGE_TYPE = "exchange_message";
export type ExchangeMessage = {
	customType: typeof EXCHANGE_MESSAGE_TYPE;
	content: string;
	display: true;
	details: Pick<Message, "from" | "seq" | "at" | "text">;
};

export function buildExchangeMessage(message: Message): ExchangeMessage {
	const { from, seq, at, text } = message;
	return {
		customType: EXCHANGE_MESSAGE_TYPE,
		content: `Session "${from}" says:\n\n${text}`,
		display: true,
		details: { from, seq, at, text },
	};
}
