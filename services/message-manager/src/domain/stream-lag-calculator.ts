export function computeLag(groups: unknown[][], groupName: string): number {
	for (const group of groups) {
		const [, groupNameValue, , , , lastDeliveredValue] = group;
		if (String(groupNameValue) === groupName) {
			const lastDelivered = String(lastDeliveredValue ?? "0-0");
			const lastTimestamp =
				Number.parseInt(lastDelivered.split("-")[0], 10) || 0;
			return Date.now() - lastTimestamp;
		}
	}
	return 0;
}
