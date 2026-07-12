import { describe, expect, it } from "@jest/globals";
import * as admin from "@trading-model/validation/contracts/admin/index";

describe("contracts/admin/index", () => {
	it("should export expected modules", () => {
		expect(admin).toBeDefined();
	});
});
