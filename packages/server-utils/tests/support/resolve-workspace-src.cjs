// Preloaded with `-r` in worker threads, where Jest's moduleNameMapper does not apply:
// resolves @trading-model/* to package sources, same mapping as Jest, so no build is needed.
const Module = require("node:module");
const path = require("node:path");
const {
	workspaceModuleNameMapper,
} = require("../../../../scripts/jest-workspace-mapper.cjs");

const rules = Object.entries(
	workspaceModuleNameMapper(path.join(__dirname, "..", ".."))
).map(([pattern, target]) => [new RegExp(pattern), target]);

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
	for (const [re, target] of rules) {
		if (re.test(request)) {
			return resolveFilename.call(this, request.replace(re, target), ...rest);
		}
	}
	return resolveFilename.call(this, request, ...rest);
};
