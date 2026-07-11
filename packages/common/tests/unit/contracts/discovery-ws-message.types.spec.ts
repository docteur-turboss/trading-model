import { describe, expect, it } from "@jest/globals";
import { DiscoveryWsMessageType } from "../../../src/contracts/discovery-ws-message.types";

describe("DiscoveryWsMessageType", () => {
	it("should have expected values", () => {
		expect(DiscoveryWsMessageType).toBeDefined();
	});
});
