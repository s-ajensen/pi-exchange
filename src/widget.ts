export function renderWidgetLines(address: string | undefined, online: boolean): string[] | undefined {
	if (address === undefined) {
		return undefined;
	}
	const suffix = online ? "" : "  reconnecting";
	return [`exchange  ${address}${suffix}`];
}
