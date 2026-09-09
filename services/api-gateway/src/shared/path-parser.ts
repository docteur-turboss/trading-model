import { ServiceId } from "@trading-model/common/domain/primitives";

const VERSION_PATH_REGEX =
	/^\/v(?<major>\d+)\/(?<service>[^/]+)(?<path>\/.*)?$/;

type ParsedRequestPath =
	| { valid: false }
	| { valid: true; majorVersion: number; serviceName: ServiceId; path: string };

function extractPathComponents(match: RegExpMatchArray): {
	majorVersion: number;
	serviceName: ServiceId;
	path: string;
} {
	const groups = match.groups as {
		major: string;
		service: string;
		path?: string;
	};
	return {
		majorVersion: Number.parseInt(groups.major, 10),
		serviceName: ServiceId.of(groups.service),
		path: groups.path ?? "/",
	};
}

export function parseRequestPath(req: {
	path: string;
	method: string;
}): ParsedRequestPath | null {
	const match = req.path.match(VERSION_PATH_REGEX);
	if (!match) {
		return null;
	}
	const { majorVersion, serviceName, path } = extractPathComponents(match);
	if (Number.isNaN(majorVersion) || majorVersion < 1) {
		return { valid: false };
	}
	return { valid: true, majorVersion, serviceName, path };
}
