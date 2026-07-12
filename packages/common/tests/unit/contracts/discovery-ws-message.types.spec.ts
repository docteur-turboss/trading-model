import { describe, expect, it } from "@jest/globals";
import { DiscoveryWsMessageType } from "@trading-model/validation/contracts/discovery-ws-message.types";

describe("DiscoveryWsMessageType", () => {
	it("should have expected values", () => {
		expect(DiscoveryWsMessageType).toBeDefined();
	});
});
