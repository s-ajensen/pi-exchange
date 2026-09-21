import { basename, extname } from "node:path";

function normalizeName(name: string): string {
	return name.replace(/[^A-Za-z0-9._-]+/g, "-") || "session";
}

export function buildDefaultName(sessionName?: string, sessionFile?: string): string {
	if (sessionName) {
		return sessionName;
	}
	if (sessionFile) {
		return basename(sessionFile, extname(sessionFile));
	}
	return "session";
}

export function buildAddress(name: string, hostname: string): string {
	return `${normalizeName(name)}@${normalizeName(hostname)}`;
}
