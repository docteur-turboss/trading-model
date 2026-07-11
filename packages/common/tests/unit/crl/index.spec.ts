import { describe, expect, it } from "@jest/globals";
import * as crlModule from "../../../src/crl/index";

describe("crl/index", () => {
	it("should export CrlCache", () => {
		expect(crlModule.CrlCache).toBeDefined();
	});

	it("should export GLOBAL_CRL_CACHE", () => {
		expect(crlModule.GLOBAL_CRL_CACHE).toBeDefined();
	});
});
