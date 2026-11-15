jest.mock("../../../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn(),
}));

import { DeliveryWorker } from "../../../../src/application/services/delivery-worker";
import { runWorker } from "../../../helpers/broker.helper";

describe("DeliveryWorker.stop", () => {
	it("closes the journal again once the loops ended, so a reader reopened meanwhile is released", async () => {
		let release: (value: unknown[]) => void = () => undefined;
		const events: string[] = [];
		const journal = {
			groups: jest
				.fn()
				.mockResolvedValue([{ topic: "market.candle", service: "svc" }]),
			close: jest.fn(() => events.push("close")),
		};
		const registry = {
			getSubscriptions: jest.fn(() =>
				new Promise((resolve) => {
					release = resolve;
				}).then((v) => {
					events.push("registry-done");
					return v;
				})
			),
		};
		const worker = new DeliveryWorker({
			journal,
			registry,
			deliveryPort: {},
		} as never);
		worker.start();
		await new Promise((resolve) => setImmediate(resolve));
		const stopping = worker.stop();
		release([]);
		await stopping;
		expect(events).toEqual(["close", "registry-done", "close"]);
	});
});

describe("DeliveryWorker with an open circuit", () => {
	it("does not claim pending entries, so their attempts are not consumed", async () => {
		const journal = {
			groups: jest.fn().mockResolvedValue([{ topic: "t", service: "svc" }]),
			claimDue: jest.fn().mockResolvedValue([]),
			// Resolves on a timer like a blocking read, so the loop yields to the event loop.
			readNew: jest.fn(
				() => new Promise((resolve) => setTimeout(resolve, 10, []))
			),
		};
		const registry = {
			getSubscriptions: jest
				.fn()
				.mockResolvedValue([
					{ serviceIdentity: { serviceName: "svc" }, callbackPath: "/cb" },
				]),
		};
		const worker = new DeliveryWorker({
			journal,
			registry,
			deliveryPort: {},
		} as never);
		const subscriptions = (
			worker as never as { _subscriptions: Map<string, unknown> }
		)._subscriptions;
		subscriptions.set("t|svc", {
			callbackPath: "/cb",
			isCircuitOpen: () => true,
		});
		await runWorker(worker);
		expect(journal.claimDue).not.toHaveBeenCalled();
		expect(journal.readNew).toHaveBeenCalled();
	});
});

describe("DeliveryWorker group retirement", () => {
	const build = (subscribed: boolean, graceMs: number) => {
		const journal = {
			groups: jest.fn().mockResolvedValue([{ topic: "t", service: "svc" }]),
			retire: jest.fn().mockResolvedValue(undefined),
			claimDue: jest.fn().mockResolvedValue([]),
			readNew: jest.fn(
				() => new Promise((resolve) => setTimeout(resolve, 10, []))
			),
		};
		const registry = {
			getSubscriptions: jest
				.fn()
				.mockResolvedValue(
					subscribed
						? [{ serviceIdentity: { serviceName: "svc" }, callbackPath: "/cb" }]
						: []
				),
		};
		const worker = new DeliveryWorker({
			journal,
			registry,
			deliveryPort: {},
			graceMs,
		} as never);
		return { journal, worker };
	};

	it("retires a group without subscriber once the grace is over", async () => {
		const { journal, worker } = build(false, 0);
		await runWorker(worker);
		expect(journal.retire).toHaveBeenCalledWith({ topic: "t", service: "svc" });
	});

	it("keeps the group of a subscriber that is back, or still within the grace", async () => {
		const back = build(true, 0);
		await runWorker(back.worker);
		const waiting = build(false, 60_000);
		await runWorker(waiting.worker);
		expect(back.journal.retire).not.toHaveBeenCalled();
		expect(waiting.journal.retire).not.toHaveBeenCalled();
	});
});
