import { readFile } from "node:fs/promises";

export type Config = { server: string; secret: string };

function validateConfig(value: unknown): value is Config {
	if (!value || typeof value !== "object") {
		return false;
	}
	const { server, secret } = value as Config;
	return typeof server === "string" && /^https?:\/\//.test(server)
		&& URL.canParse(server) && typeof secret === "string" && secret.length > 0;
}

export async function readConfig(path: string): Promise<Config> {
	try {
		const value: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!validateConfig(value)) {
			throw new Error("invalid config");
		}
		return { server: value.server, secret: value.secret };
	} catch {
		throw new Error(`${path}: expected JSON with server and secret`);
	}
}
