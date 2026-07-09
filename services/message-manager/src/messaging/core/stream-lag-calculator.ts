export function computeLag(groups: unknown[][], groupName: string): number {
	for (const group of groups) {
		if (String(group[1]) === groupName) {
			const lastDelivered = String(group[5] ?? "0-0");
			const lastTimestamp =
				Number.parseInt(lastDelivered.split("-")[0], 10) || 0;
			return Date.now() - lastTimestamp;
		}
	}
	return 0;
}
