const IPV4_PREFIX = "::ffff:";

export function anonymizeIp(
	raw: string | undefined | null
): string | undefined {
	if (!raw) {
		return;
	}
	const ip = raw.startsWith(IPV4_PREFIX) ? raw.slice(IPV4_PREFIX.length) : raw;
	if (ip.includes(":")) {
		const parts = ip.split(":");
		for (let i = 5; i < parts.length; i++) {
			parts[i] = "0";
		}
		return parts.join(":");
	}
	const dot = ip.lastIndexOf(".");
	if (dot === -1) {
		return ip;
	}
	return `${ip.slice(0, dot)}.0`;
}
