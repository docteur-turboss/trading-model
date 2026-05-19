import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Dispatcher } from "../../../../src/messaging/core/dispatcher";
import { createMockHttpClient } from "../../../helpers/broker.helper";
import {
  createMockMessage,
  mockSubscriberIdentity,
  mockSubscribeParams,
} from "../../../fixtures/broker.fixture";

jest.mock("config/address-manager", () => ({
  findAService: jest.fn<() => Promise<{ ip: string; port: number }>>().mockResolvedValue({ ip: "10.0.0.1", port: 8444 }),
}));

describe("Dispatcher", () => {
  let mockHttpClient: ReturnType<typeof createMockHttpClient>;
  let dispatcher: Dispatcher;

  beforeEach(() => {
    mockHttpClient = createMockHttpClient();
    dispatcher = new Dispatcher(mockHttpClient as never);
  });

  describe("registerSubscription", () => {
    it("should register a new subscription for a topic", async () => {
      dispatcher.registerSubscription(mockSubscribeParams);

      const message = createMockMessage("test");
      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).toHaveBeenCalled();
    });

    it("should not register duplicate subscriptions for the same instance", async () => {
      dispatcher.registerSubscription(mockSubscribeParams);
      dispatcher.registerSubscription(mockSubscribeParams);

      const message = createMockMessage("test");
      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it("should register subscriptions for different topics separately", async () => {
      dispatcher.registerSubscription(mockSubscribeParams);
      dispatcher.registerSubscription({
        ...mockSubscribeParams,
        topic: "other.topic",
      });

      const message1 = createMockMessage("test", { topic: "test.topic" });
      const message2 = createMockMessage("test", { topic: "other.topic" });

      await dispatcher.dispatch(message1);
      await dispatcher.dispatch(message2);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
    });

    it("should register multiple instances for the same topic", async () => {
      dispatcher.registerSubscription(mockSubscribeParams);
      dispatcher.registerSubscription({
        topic: "test.topic",
        callbackPath: "other/callback",
        consumerIdentity: { ...mockSubscriberIdentity, instanceId: "subscriber-2" },
      });

      const message = createMockMessage("test");
      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
    });
  });

  describe("dispatch", () => {
    it("should do nothing when no subscriptions exist for the topic", async () => {
      const message = createMockMessage("test");

      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("should dispatch to all matching subscriptions", async () => {
      dispatcher.registerSubscription(mockSubscribeParams);

      const message = createMockMessage("test");
      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it("should not dispatch to subscriptions of other topics", async () => {
      dispatcher.registerSubscription(mockSubscribeParams);

      const message = createMockMessage("test", { topic: "other.topic" });
      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("should not fail when a subscription dispatch throws", async () => {
      mockHttpClient.post.mockRejectedValueOnce(new Error("Delivery failed"));

      dispatcher.registerSubscription(mockSubscribeParams);
      dispatcher.registerSubscription({
        ...mockSubscribeParams,
        consumerIdentity: { ...mockSubscriberIdentity, instanceId: "subscriber-2" },
      });

      const message = createMockMessage("test");
      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(3);
    });

    it("should deduplicate subscriptions by instanceId", async () => {
      dispatcher.registerSubscription(mockSubscribeParams);
      dispatcher.registerSubscription({
        ...mockSubscribeParams,
        callbackPath: "different/path",
        consumerIdentity: mockSubscriberIdentity,
      });

      const message = createMockMessage("test");
      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });
  });

  describe("unregisterSubscription", () => {
    it("should remove a subscription from a topic", async () => {
      dispatcher.registerSubscription(mockSubscribeParams);
      dispatcher.unregisterSubscription({
        topic: "test.topic",
        instanceId: mockSubscriberIdentity.instanceId,
      });

      const message = createMockMessage("test");
      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("should do nothing when unregistering from a non-existent topic", () => {
      expect(() =>
        dispatcher.unregisterSubscription({
          topic: "nonexistent.topic",
          instanceId: "unknown",
        }),
      ).not.toThrow();
    });

    it("should keep other subscriptions when removing one instance", async () => {
      dispatcher.registerSubscription(mockSubscribeParams);
      dispatcher.registerSubscription({
        ...mockSubscribeParams,
        consumerIdentity: { ...mockSubscriberIdentity, instanceId: "subscriber-2" },
      });

      dispatcher.unregisterSubscription({
        topic: "test.topic",
        instanceId: mockSubscriberIdentity.instanceId,
      });

      const message = createMockMessage("test");
      await dispatcher.dispatch(message);

      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });
  });
});
