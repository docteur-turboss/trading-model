const IPV4_PREFIX = "::ffff:";

export function anonymizeIp(
	raw: string | undefined | null
): string | undefined {
	if (!raw) {
		return;
	}
	const ip = raw.startsWith(IPV4_PREFIX) ? raw.slice(IPV4_PREFIX.length) : raw;
	if (ip.includes(":")) {
		const [head = "", tail] = ip.split("::");
		const headGroups = head ? head.split(":") : [];
		const tailGroups = tail ? tail.split(":") : [];
		const fill =
			tail === undefined
				? 0
				: Math.max(0, 8 - headGroups.length - tailGroups.length);
		const groups = [
			...headGroups,
			...new Array<string>(fill).fill("0"),
			...tailGroups,
		];
		return `${groups.slice(0, 3).join(":")}::`;
	}
	const dot = ip.lastIndexOf(".");
	if (dot === -1) {
		return ip;
	}
	return `${ip.slice(0, dot)}.0`;
}
