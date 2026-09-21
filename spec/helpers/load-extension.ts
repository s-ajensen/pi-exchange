import { createEventBus, discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";

export const PACKAGE_DIR = new URL("../..", import.meta.url).pathname;

export async function loadExchange(agentDir: string) {
	const result = await discoverAndLoadExtensions([PACKAGE_DIR], PACKAGE_DIR, agentDir, createEventBus());
	if (result.errors.length) {
		throw new Error(`extension failed to load: ${JSON.stringify(result.errors)}`);
	}
	const extension = result.extensions.find((candidate) => candidate.tools.has("exchange"));
	if (!extension) {
		throw new Error("pi-exchange not found among loaded extensions");
	}
	const sent: unknown[] = [];
	const entries: unknown[] = [];
	result.runtime.sendMessage = ((message: unknown, options: unknown) => { sent.push({ message, options }); }) as never;
	result.runtime.appendEntry = ((customType: string, data: unknown) => { entries.push({ customType, data }); }) as never;
	result.runtime.getSessionName = () => "test";
	return { extension, sent, entries };
}
