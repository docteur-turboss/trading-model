import { describe, expect, it, jest } from "@jest/globals";

const POST = jest.fn<(...args: any[]) => Promise<void>>();
const CREATE = jest.fn<(...args: any[]) => unknown>();

jest.mock("@trading-model/broker-message/create-message-manager", () => ({
	createMessageManager: (...args: any[]) => CREATE(...args),
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
	it("does not throw when the bus client cannot be built", () => {
		CREATE.mockImplementationOnce(() => {
			throw new Error("no SVID");
		});
		expect(() => publishRiskEvent("order.transition", {})).not.toThrow();
	});

	it.each([
		["order.transition", "risk.order.transitioned"],
		["kill_switch.engaged", "risk.kill-switch.engaged"],
		["kill_switch.rearmed", "risk.kill-switch.rearmed"],
	])("publishes %s as %s with its payload", (event, topic) => {
		CREATE.mockReturnValue({ messageManager: { post: { indirect: POST } } });
		POST.mockResolvedValue();
		publishRiskEvent(event, { mode: "paper" });
		const [payload, metadata] =
			POST.mock.calls[POST.mock.calls.length - 1] ?? [];
		expect(payload).toEqual({ mode: "paper" });
		expect(metadata.topic).toBe(topic);
	});

	it("does not throw when the bus refuses", () => {
		POST.mockRejectedValue(new Error("down"));
		expect(() => publishRiskEvent("order.transition", {})).not.toThrow();
	});
});
