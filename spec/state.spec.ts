import { expect, test } from "bun:test";
import { buildStateEntry, deriveJoinState } from "../src/state.ts";

test("ignores other entries and invalid exchange data", () => {
	expect(deriveJoinState([{ type: "message" }, { type: "custom", customType: "other", data: { joined: true, address: "a@h" } }])).toEqual({ joined: false });
	expect(deriveJoinState([{ type: "custom", customType: "exchange", data: null }])).toEqual({ joined: false });
});

test("defaults to not joined", () => {
	expect(deriveJoinState([])).toEqual({ joined: false });
});

test("uses the latest exchange entry on the supplied branch", () => {
	const joined = buildStateEntry("a@h");
	expect(joined).toEqual({ customType: "exchange", data: { joined: true, address: "a@h" } });
	expect(deriveJoinState([{ type: "custom", ...joined }])).toEqual(joined.data);
	expect(deriveJoinState([{ type: "custom", ...joined }, { type: "custom", ...buildStateEntry() }])).toEqual({ joined: false });
});
