import { describe, expect, it, jest } from "@jest/globals";

const POST = jest.fn<(...args: any[]) => Promise<void>>();

jest.mock("@trading-model/broker-message/create-message-manager", () => ({
	createMessageManager: () => ({
		messageManager: { post: { indirect: POST } },
	}),
}));
jest.mock("../../src/config/address-manager", () => ({ AddressManager: {} }));
jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: { INSTANCE_ID: "risk-execution-1", SERVICE_NAME: "risk-execution" },
}));
jest.mock("@trading-model/common/config/tls-paths", () => ({
	buildTlsFromEnv: () => ({}),
}));

import { publishRiskEvent } from "../../src/config/audit";

describe("publishRiskEvent", () => {
	it.each([
		["order.transition", "risk.order.transitioned"],
		["kill_switch.engaged", "risk.kill-switch.engaged"],
		["kill_switch.rearmed", "risk.kill-switch.rearmed"],
	])("publishes %s as %s with its payload", (event, topic) => {
		POST.mockResolvedValue();
		publishRiskEvent(event, { mode: "paper" });
		const [payload, metadata] =
			POST.mock.calls[POST.mock.calls.length - 1] ?? [];
		expect(payload).toEqual({ mode: "paper" });
		expect(metadata.topic).toBe(topic);
	});

	it("keeps log-only events off the bus", () => {
		POST.mockClear();
		publishRiskEvent("broker.error", { error: "x" });
		expect(POST).not.toHaveBeenCalled();
	});

	it("does not throw when the bus refuses", () => {
		POST.mockRejectedValue(new Error("down"));
		expect(() => publishRiskEvent("order.transition", {})).not.toThrow();
	});
});
