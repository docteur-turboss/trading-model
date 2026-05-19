import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";
import {
  SubscriptionToATopic,
  DeleteASubscription,
  PublishAMessage,
} from "../../../../src/messaging/transport/http.controller";
import { Broker } from "../../../../src/messaging/core/broker";
import { createMockDispatcher } from "../../../helpers/broker.helper";

jest.mock("@trading-model/common/middleware/catchError", () => ({
  catchSync: (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]): void | Promise<void> => {
      const next = args[2] as (err?: unknown) => void;
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          return result.catch((e) => { next(e); }) as Promise<void>;
        }
      } catch (e) {
        next(e);
      }
      return undefined;
    },
}));

describe("HTTP Controller", () => {
  let broker: Broker;
  let mockDispatcher: ReturnType<typeof createMockDispatcher>;

  beforeEach(() => {
    mockDispatcher = createMockDispatcher();
    broker = new Broker(mockDispatcher as never);
  });

  describe("SubscriptionToATopic", () => {
    it("should call broker.subscribe with valid body", () => {
      const handler = SubscriptionToATopic(broker);
      const req = {
        body: {
          topic: "test.topic",
          callbackPath: "message/callback",
          consumerIdentity: {
            serviceName: "FinancialScrapperService",
            instanceId: "instance-1",
          },
        },
      } as Request;
      const next = jest.fn();

      handler(req, {} as Response, next);

      expect(mockDispatcher.registerSubscription).toHaveBeenCalledWith(req.body);
      expect(next).toHaveBeenCalled();
    });

    it("should throw on invalid body", () => {
      const handler = SubscriptionToATopic(broker);
      const req = { body: { topic: "" } } as Request;
      const next = jest.fn();

      handler(req, {} as Response, next);

      expect(mockDispatcher.registerSubscription).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe("DeleteASubscription", () => {
    it("should call broker.unsubscribe with valid body", () => {
      const handler = DeleteASubscription(broker);
      const req = {
        body: { topic: "test.topic", instanceId: "instance-1" },
      } as Request;
      const next = jest.fn();

      handler(req, {} as Response, next);

      expect(mockDispatcher.unregisterSubscription).toHaveBeenCalledWith(req.body);
      expect(next).toHaveBeenCalled();
    });

    it("should throw on invalid body", () => {
      const handler = DeleteASubscription(broker);
      const req = { body: { topic: "" } } as Request;
      const next = jest.fn();

      handler(req, {} as Response, next);

      expect(mockDispatcher.unregisterSubscription).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe("PublishAMessage", () => {
    it("should call broker.publish with valid body", async () => {
      const handler = PublishAMessage(broker);
      const req = {
        body: {
          payload: { key: "value" },
          metadata: {
            schemaVersion: "1.0",
            eventType: "TestEvent",
            topic: "test.topic",
            publisher: {
              serviceName: "FinancialScrapperService",
              instanceId: "instance-1",
            },
          },
        },
      } as Request;
      const next = jest.fn();

      await handler(req, {} as Response, next);

      expect(mockDispatcher.dispatch).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it("should throw on invalid body", async () => {
      const handler = PublishAMessage(broker);
      const req = { body: { payload: {} } } as Request;
      const next = jest.fn();

      await handler(req, {} as Response, next);

      expect(mockDispatcher.dispatch).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });
});
