import { describe, expect, it, jest } from "@jest/globals";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import { InMemoryMessageJournal } from "../../../../src/adapters/outbound/in-memory-message-journal";
import { InMemorySubscriptionStore } from "../../../../src/adapters/outbound/in-memory-subscription-store";
import { SubscriptionRegistry } from "../../../../src/application/services/subscription-registry";
import { mockSubscribeParams } from "../../../fixtures/broker.fixture";

jest.mock("../../../../src/config/metrics", () => ({
	SUBSCRIPTION_COUNT: { set: jest.fn() },
}));

const binding = mockSubscribeParams as unknown as TopicBinding;

function setup() {
	const journal = new InMemoryMessageJournal();
	return {
		journal,
		registry: new SubscriptionRegistry(
			new InMemorySubscriptionStore(),
			journal
		),
	};
}

describe("SubscriptionRegistry", () => {
	it("should register the journal group of the subscriber service", async () => {
		const { registry, journal } = setup();

		await registry.subscribe(binding);

		await expect(journal.groups()).resolves.toEqual([
			{ topic: binding.topic, service: binding.serviceIdentity.serviceName },
		]);
	});

	it("should keep the journal group after the last instance unsubscribed", async () => {
		const { registry, journal } = setup();
		await registry.subscribe(binding);

		await registry.unsubscribe({
			topic: binding.topic,
			instanceId: binding.serviceIdentity.instanceId,
		});

		await expect(registry.getSubscriptions(binding.topic)).resolves.toEqual([]);
		await expect(journal.groups()).resolves.toHaveLength(1);
	});

	it("should renew a subscription with its latest callback", async () => {
		const { registry } = setup();
		await registry.subscribe(binding);

		await registry.subscribe({ ...binding, callbackPath: "new/path" });

		const subscriptions = await registry.getSubscriptions(binding.topic);
		expect(subscriptions).toHaveLength(1);
		expect(subscriptions[0]?.callbackPath).toBe("new/path");
	});
});
