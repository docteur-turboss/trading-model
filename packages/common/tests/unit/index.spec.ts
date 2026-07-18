import { describe, expect, it } from "@jest/globals";
import * as main from "../../src/index";

describe("main index", () => {
	const runtimeExports = [
		"HttpClient",
		"logger",
		"handleCoreError",
		"MTLSAuthMiddleware",
		"ResponseException",
		"validateSchema",
		"sleep",
	];

	for (const name of runtimeExports) {
		it(`should export ${name}`, () => {
			expect((main as Record<string, unknown>)[name]).toBeDefined();
		});
	}
});
