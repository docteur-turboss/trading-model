import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Broker } from "../../../../src/messaging/core/broker";
import { createMockDispatcher } from "../../../helpers/broker.helper";
import {
  mockPublishPayload,
  mockPublishMetadata,
  mockSubscribeParams,
  mockUnsubscribeParams,
} from "../../../fixtures/broker.fixture";



describe("Broker", () => {
  let mockDispatcher: ReturnType<typeof createMockDispatcher>;
  let broker: Broker;

  beforeEach(() => {
    mockDispatcher = createMockDispatcher();
    broker = new Broker(mockDispatcher as never);
  });

  describe("publish", () => {
    it("should delegate to dispatcher.dispatch with enriched metadata", async () => {
      await broker.publish(mockPublishPayload, mockPublishMetadata);

      expect(mockDispatcher.dispatch).toHaveBeenCalledTimes(1);

      const dispatchedMessage = mockDispatcher.dispatch.mock.calls[0][0] as unknown as {
        metadata: Record<string, unknown>;
        payload: typeof mockPublishPayload;
      };

      expect(dispatchedMessage.payload).toEqual(mockPublishPayload);
      expect(dispatchedMessage.metadata.messageId).toBeDefined();
      expect(dispatchedMessage.metadata.messageId).not.toBe("");
      expect(dispatchedMessage.metadata.emittedAt).toBeInstanceOf(Date);
      expect(dispatchedMessage.metadata.schemaVersion).toBe(mockPublishMetadata.schemaVersion);
      expect(dispatchedMessage.metadata.eventType).toBe(mockPublishMetadata.eventType);
      expect(dispatchedMessage.metadata.topic).toBe(mockPublishMetadata.topic);
      expect(dispatchedMessage.metadata.publisher).toEqual(mockPublishMetadata.publisher);
    });

    it("should generate a unique messageId for each publish", async () => {
      await broker.publish(mockPublishPayload, mockPublishMetadata);
      await broker.publish(mockPublishPayload, mockPublishMetadata);

      const id1 = (mockDispatcher.dispatch.mock.calls[0][0] as { metadata: { messageId: string } }).metadata.messageId;
      const id2 = (mockDispatcher.dispatch.mock.calls[1][0] as { metadata: { messageId: string } }).metadata.messageId;

      expect(id1).not.toBe(id2);
    });

    it("should set emittedAt to current time", async () => {
      const before = Date.now();
      await broker.publish(mockPublishPayload, mockPublishMetadata);
      const after = Date.now();

      const emittedAt = (mockDispatcher.dispatch.mock.calls[0][0] as { metadata: { emittedAt: Date } }).metadata.emittedAt.getTime();

      expect(emittedAt).toBeGreaterThanOrEqual(before);
      expect(emittedAt).toBeLessThanOrEqual(after);
    });
  });

  describe("subscribe", () => {
    it("should delegate to dispatcher.registerSubscription", () => {
      broker.subscribe(mockSubscribeParams);

      expect(mockDispatcher.registerSubscription).toHaveBeenCalledTimes(1);
      expect(mockDispatcher.registerSubscription).toHaveBeenCalledWith(mockSubscribeParams);
    });
  });

  describe("unsubscribe", () => {
    it("should delegate to dispatcher.unregisterSubscription", () => {
      broker.unsubscribe(mockUnsubscribeParams);

      expect(mockDispatcher.unregisterSubscription).toHaveBeenCalledTimes(1);
      expect(mockDispatcher.unregisterSubscription).toHaveBeenCalledWith(mockUnsubscribeParams);
    });
  });
});
