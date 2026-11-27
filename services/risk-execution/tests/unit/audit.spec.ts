import { describe, expect, it, jest } from "@jest/globals";
import promClient from "prom-client";

const POST = jest.fn<(...args: any[]) => Promise<void>>();
const CREATE = jest.fn<(...args: any[]) => unknown>();

jest.mock("@trading-model/broker-message/create-message-manager", () => ({
	createServiceMessageManager: (...args: any[]) => CREATE(...args),
}));
jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: { INSTANCE_ID: "risk-execution-1", SERVICE_NAME: "risk-execution" },
}));

import {
	initRiskOutbox,
	publishRiskEvent,
	replayRiskEvents,
} from "../../src/config/audit";

describe("publishRiskEvent", () => {
	it("does not throw when the bus client cannot be built", () => {
		CREATE.mockImplementationOnce(() => {
			throw new Error("REDIS_URL or REDIS_SENTINELS is required by the bus");
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

	it("counts the oldest event dropped when the outbox is full and tracks the depth", async () => {
		CREATE.mockReturnValue({ messageManager: { post: { indirect: POST } } });
		const full = Array.from({ length: 1000 }, () => ({
			topic: "risk.order.transitioned",
			fields: {},
		}));
		POST.mockReset();
		POST.mockRejectedValue(new Error("down"));
		await initRiskOutbox({
			load: async () => full as any[],
			save: async () => undefined,
		});
		const value = async (name: string) =>
			(await promClient.register.getSingleMetric(name)?.get())?.values[0]
				?.value;
		expect(await value("risk_outbox_pending")).toBe(1000);
		publishRiskEvent("order.transition", {});
		await new Promise((resolve) => setImmediate(resolve));
		await replayRiskEvents();
		expect(await value("risk_outbox_dropped_total")).toBe(1);
		expect(await value("risk_outbox_pending")).toBe(1000);
	});

	// Until Redis restarts with the new ACL user (#1241): the auth refusal must reach the outbox.
	it.each([
		"WRONGPASS invalid username-password pair or user is disabled.",
		"NOPERM User risk-execution has no permissions to run the 'xadd' command",
	])("keeps an event refused by Redis auth in the file: %s", async (reply) => {
		CREATE.mockReturnValue({ messageManager: { post: { indirect: POST } } });
		let saved: unknown[] = [];
		await initRiskOutbox({
			load: async () => [] as any[],
			save: async (doc: any[]) => {
				saved = structuredClone(doc);
			},
		});
		POST.mockReset();
		POST.mockRejectedValue(new Error(reply));
		publishRiskEvent("kill_switch.engaged", { mode: "paper" });
		await new Promise((resolve) => setImmediate(resolve));
		await replayRiskEvents();

		expect(saved).toEqual([
			expect.objectContaining({ topic: "risk.kill-switch.engaged" }),
		]);
	});
});
