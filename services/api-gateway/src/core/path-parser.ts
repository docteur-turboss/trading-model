const VERSION_PATH_REGEX = /^\/v(\d+)\/([^/]+)(\/.*)?$/;

type ParsedRequestPath =
	| { valid: false }
	| { valid: true; majorVersion: number; serviceName: string; path: string };

function extractPathComponents(match: RegExpMatchArray): {
	majorVersion: number;
	serviceName: string;
	path: string;
} {
	return {
		majorVersion: Number.parseInt(match[1], 10),
		serviceName: match[2],
		path: match[3] ?? "/",
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
