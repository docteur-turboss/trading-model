import { ServiceId } from "@trading-model/primitives/primitives";

const VERSION_PATH_REGEX =
	/^\/v(?<major>\d+)\/(?<service>[^/]+)(?<path>\/.*)?$/;

type ParsedRequestPath =
	| { valid: false }
	| { valid: true; majorVersion: number; serviceName: ServiceId; path: string };

export function parseRequestPath(req: {
	path: string;
}): ParsedRequestPath | null {
	const match = req.path.match(VERSION_PATH_REGEX);
	if (!match) {
		return null;
	}
	const { major, service, path } = match.groups as {
		major: string;
		service: string;
		path?: string;
	};
	const majorVersion = Number.parseInt(major, 10);
	if (majorVersion < 1) {
		return { valid: false };
	}
	return {
		valid: true,
		majorVersion,
		serviceName: ServiceId.of(service),
		path: path ?? "/",
	};
}
