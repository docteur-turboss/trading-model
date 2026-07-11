import { describe, expect, it } from "@jest/globals";
import * as main from "../../src/index";

describe("main index", () => {
	const runtimeExports = [
		"HttpClient",
		"logger",
		"secureRandom",
		"handleCoreError",
		"MTLSAuthMiddleware",
		"ResponseException",
		"validateSchema",
		"createBootstrap",
		"configureApp",
		"PING_PATH",
		"createSecureServer",
		"createAndStartHttpsServer",
		"setupTlsWatcher",
		"sleep",
		"BaseEnvSchema",
		"validateEnv",
	];

	for (const name of runtimeExports) {
		it(`should export ${name}`, () => {
			expect((main as Record<string, unknown>)[name]).toBeDefined();
		});
	}
});
