import { describe, expect, it } from "@jest/globals";
import { DiscoveryWsMessageType } from "@trading-model/validation/adapters/inbound/discovery-ws-message.types";

describe("DiscoveryWsMessageType", () => {
	it("should have expected values", () => {
		expect(DiscoveryWsMessageType).toBeDefined();
	});
});
