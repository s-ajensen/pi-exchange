export type JoinState = { joined: true; address: string } | { joined: false };
type Entry = { type: string; customType?: string; data?: unknown };

function readState(data: unknown): JoinState {
	if (data && typeof data === "object" && "joined" in data && data.joined === true
		&& "address" in data && typeof data.address === "string") {
		return { joined: true, address: data.address };
	}
	return { joined: false };
}

export function buildStateEntry(address?: string): { customType: "exchange"; data: JoinState } {
	const data: JoinState = address === undefined ? { joined: false } : { joined: true, address };
	return { customType: "exchange", data };
}

export function deriveJoinState(entries: readonly Entry[]): JoinState {
	const entry = [...entries].reverse().find((entry) => entry.type === "custom" && entry.customType === "exchange");
	return readState(entry?.data);
}
