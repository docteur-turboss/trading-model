jest.mock("../../../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn(),
}));

import { DeliveryWorker } from "../../../../src/application/services/delivery-worker";

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
			readNew: jest.fn().mockResolvedValue([]),
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
		await worker.tick();
		expect(journal.claimDue).not.toHaveBeenCalled();
		expect(journal.readNew).toHaveBeenCalled();
	});
});
