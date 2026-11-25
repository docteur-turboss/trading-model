import { describe, expect, it, jest } from "@jest/globals";

const POST = jest.fn<(...args: any[]) => Promise<void>>();
const CREATE = jest.fn<(...args: any[]) => unknown>();
const JOURNAL = { bus: "redis" };

jest.mock("@trading-model/broker-message/create-message-manager", () => ({
	createMessageManager: (...args: any[]) => CREATE(...args),
	busJournalFromEnv: () => JOURNAL,
}));
jest.mock("../../src/config/address-manager", () => ({ AddressManager: {} }));
jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: { INSTANCE_ID: "risk-execution-1", SERVICE_NAME: "risk-execution" },
}));
jest.mock("@trading-model/common/config/tls-paths", () => ({
	buildTlsFromEnv: () => ({}),
}));

import {
	initRiskOutbox,
	publishRiskEvent,
	replayRiskEvents,
} from "../../src/config/audit";

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
		expect(payload).toMatchObject({ mode: "paper" });
		expect(metadata.topic).toBe(topic);
		expect(CREATE).toHaveBeenLastCalledWith(
			expect.objectContaining({ journal: JOURNAL })
		);
	});

	it("does not throw when the bus refuses", () => {
		POST.mockRejectedValue(new Error("down"));
		expect(() => publishRiskEvent("order.transition", {})).not.toThrow();
	});

	it("keeps a refused event in the file, replays it once, then empties the file", async () => {
		CREATE.mockReturnValue({ messageManager: { post: { indirect: POST } } });
		let saved: unknown[] = [];
		const store = {
			load: async () => [] as any[],
			save: async (doc: any[]) => {
				saved = structuredClone(doc);
			},
		};
		await initRiskOutbox(store);
		POST.mockRejectedValue(new Error("down"));
		publishRiskEvent("order.transition", { mode: "paper" });
		await new Promise((resolve) => setImmediate(resolve));
		await replayRiskEvents();
		expect(saved).toHaveLength(1);

		POST.mockReset();
		POST.mockResolvedValue();
		await initRiskOutbox({
			load: async () => saved as any[],
			save: store.save,
		});
		expect(saved).toHaveLength(0);
		const [payload] = POST.mock.calls[0] ?? [];
		expect(payload).toMatchObject({ mode: "paper" });
		expect(payload.eventId).toEqual(expect.any(String));
	});
});
