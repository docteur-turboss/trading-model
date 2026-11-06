import { describe, expect, it, jest } from "@jest/globals";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import { InMemorySubscriptionStore } from "../../../../src/adapters/outbound/in-memory-subscription-store";
import { SubscriptionRegistry } from "../../../../src/application/services/subscription-registry";
import { mockSubscribeParams } from "../../../fixtures/broker.fixture";

jest.mock("../../../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn(),
}));

jest.mock("../../../../src/config/metrics", () => ({
	SUBSCRIPTION_COUNT: { set: jest.fn() },
	SUBSCRIBER_DELIVERY_CONCURRENCY: { inc: jest.fn(), dec: jest.fn() },
}));

const binding = mockSubscribeParams as unknown as TopicBinding;

function registry() {
	return new SubscriptionRegistry({} as never, new InMemorySubscriptionStore());
}

describe("SubscriptionRegistry", () => {
	it("should keep the delivery state of a renewed subscription", async () => {
		const subscriptions = registry();
		await subscriptions.subscribe(binding);
		const [first] = await subscriptions.getSubscriptions(binding.topic);

		await subscriptions.subscribe(binding);
		const [renewed] = await subscriptions.getSubscriptions(binding.topic);

		expect(renewed).toBe(first);
	});

	it("should rebuild a subscription whose callback changed", async () => {
		const subscriptions = registry();
		await subscriptions.subscribe(binding);
		const [first] = await subscriptions.getSubscriptions(binding.topic);

		await subscriptions.subscribe({ ...binding, callbackPath: "new/path" });
		const [moved] = await subscriptions.getSubscriptions(binding.topic);

		expect(moved).not.toBe(first);
		expect(moved?.callbackPath).toBe("new/path");
	});

	it("should hold one subscription per service, kept while one instance remains", async () => {
		const subscriptions = registry();
		const second = {
			...binding,
			serviceIdentity: {
				...binding.serviceIdentity,
				instanceId: "subscriber-2",
			},
		} as TopicBinding;
		await subscriptions.subscribe(binding);
		await subscriptions.subscribe(second);
		const grouped = await subscriptions.getSubscriptions(binding.topic);

		await subscriptions.unsubscribe({
			topic: binding.topic,
			instanceId: binding.serviceIdentity.instanceId,
		});
		const remaining = await subscriptions.getSubscriptions(binding.topic);

		expect(grouped).toHaveLength(1);
		expect(remaining).toHaveLength(1);
		// same object: the circuit breaker state survives the departure of an instance
		expect(remaining[0]).toBe(grouped[0]);
	});

	it("should drop the local state of an unsubscribed instance", async () => {
		const subscriptions = registry();
		const other = { ...binding, topic: "other.topic" } as TopicBinding;
		await subscriptions.subscribe(binding);
		await subscriptions.subscribe(other);

		await subscriptions.unsubscribe({
			topic: binding.topic,
			instanceId: binding.serviceIdentity.instanceId,
		});

		await expect(
			subscriptions.getSubscriptions(binding.topic)
		).resolves.toEqual([]);
		await expect(
			subscriptions.getSubscriptions(other.topic)
		).resolves.toHaveLength(1);
	});
});
