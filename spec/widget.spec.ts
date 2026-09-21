import { expect, test } from "bun:test";
import { renderWidgetLines } from "../src/widget.ts";

test("shows reconnecting after a failed heartbeat", () => {
	expect(renderWidgetLines("a@h", false)).toEqual(["exchange  a@h  reconnecting"]);
});

test("removes the widget when not joined", () => {
	expect(renderWidgetLines(undefined, false)).toBeUndefined();
});

test("shows the joined address", () => {
	expect(renderWidgetLines("a@h", true)).toEqual(["exchange  a@h"]);
});
