import { parseServiceName } from "@trading-model/common/config/services.types";
import {
	isAllowedProxyIP,
	parseCIDRList,
} from "@trading-model/primitives/primitives";
import { z } from "zod";

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

let _cachedRanges: ReturnType<typeof parseCIDRList> | null = null;
function _getAllowedRanges() {
	if (_cachedRanges === null) {
		_cachedRanges = parseCIDRList(
			process.env.ALLOWED_REGISTRATION_CIDRS ??
				"10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8"
		);
	}
	return _cachedRanges;
}

function _isValidServiceName(value: string): boolean {
	try {
		parseServiceName(value);
		return true;
	} catch {
		return false;
	}
}

export const REGISTER_SCHEMA = z
	.object({
		serviceName: z
			.string()
			.min(1, "serviceName is required")
			.refine(_isValidServiceName, {
				message: "Invalid serviceName — must be a known platform service",
				path: ["serviceName"],
			}),
		instanceId: z.string().min(1).optional(),
		ip: z.string().regex(IPV4_REGEX, "Invalid IP address"),
		port: z.number().int().min(1).max(65535, "Invalid port"),
		version: z.string().optional(),
	})
	.refine(
		(data) => {
			const ranges = _getAllowedRanges();
			return ranges.length === 0 || isAllowedProxyIP(data.ip, ranges);
		},
		{ message: "IP address is not in an allowed range", path: ["ip"] }
	);

export function parseRegisterBody(
	req: import("express").Request
): z.infer<typeof REGISTER_SCHEMA> | null {
	const parsed = REGISTER_SCHEMA.safeParse(req.body);
	return parsed.success ? parsed.data : null;
}
