interface CIDRRange {
	start: number;
	end: number;
	mask: number;
}

function ipToUint32(ip: string): number {
	const parts = ip.split(".");
	if (parts.length !== 4) {
		return -1;
	}
	let result = 0;
	for (const part of parts) {
		const octet = Number.parseInt(part, 10);
		if (octet < 0 || octet > 255 || Number.isNaN(octet)) {
			return -1;
		}
		result = (result << 8) | octet;
	}
	return result >>> 0;
}

function parseCIDR(cidr: string): CIDRRange | null {
	const [ip, prefixStr] = cidr.split("/");
	if (!(ip && prefixStr)) {
		return null;
	}
	const prefix = Number.parseInt(prefixStr, 10);
	if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
		return null;
	}
	const ipNum = ipToUint32(ip);
	if (ipNum < 0) {
		return null;
	}
	const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
	const start = (ipNum & mask) >>> 0;
	const end = (start | (~mask >>> 0)) >>> 0;
	return { start, end, mask };
}

const PRIVATE_RANGES: readonly CIDRRange[] = [
	parseCIDR("10.0.0.0/8")!,
	parseCIDR("172.16.0.0/12")!,
	parseCIDR("192.168.0.0/16")!,
	parseCIDR("127.0.0.0/8")!,
].filter((entry): entry is CIDRRange => entry !== null);

export function isPrivateIP(ip: string): boolean {
	const ipNum = ipToUint32(ip);
	if (ipNum < 0) {
		return false;
	}
	return PRIVATE_RANGES.some(
		(range) => ipNum >= range.start && ipNum <= range.end
	);
}

export function isAllowedProxyIP(
	ip: string,
	allowedRanges: readonly CIDRRange[]
): boolean {
	const ipNum = ipToUint32(ip);
	if (ipNum < 0) {
		return false;
	}
	return allowedRanges.some(
		(range) => ipNum >= range.start && ipNum <= range.end
	);
}

export function parseCIDRList(cidrs: string): CIDRRange[] {
	return cidrs
		.split(",")
		.map((token) => token.trim())
		.filter((token) => token.length > 0)
		.map((token) => parseCIDR(token))
		.filter((entry): entry is CIDRRange => entry !== null);
}

export const DEFAULT_PRIVATE_CIDRS =
	"10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8";
