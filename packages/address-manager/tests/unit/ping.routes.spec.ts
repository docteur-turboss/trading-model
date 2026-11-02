import { describe, expect, it } from "@jest/globals";
import { PING_ROUTES } from "../../src/adapters/inbound/routes/ping.routes";

describe("PING_ROUTES", () => {
	it("should export a router", () => {
		expect(PING_ROUTES).toBeDefined();
	});
});
