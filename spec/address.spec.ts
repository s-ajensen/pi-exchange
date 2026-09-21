import { expect, test } from "bun:test";
import { buildAddress, buildDefaultName } from "../src/address.ts";

test("normalizes runs of invalid name and host characters", () => {
	expect(buildAddress("a / b", "my host")).toBe("a-b@my-host");
});

test("uses a nonempty fallback for an empty name", () => {
	expect(buildAddress("", "host")).toBe("session@host");
});

test("prefers session name, then basename, then session", () => {
	expect(buildDefaultName("named", "/some/file.jsonl")).toBe("named");
	expect(buildDefaultName(undefined, "/some/file.jsonl")).toBe("file");
	expect(buildDefaultName("", undefined)).toBe("session");
});

test("preserves valid address characters", () => {
	expect(buildAddress("A.b_c-1", "host.local")).toBe("A.b_c-1@host.local");
});
