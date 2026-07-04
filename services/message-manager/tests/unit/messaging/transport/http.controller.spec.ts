import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Request, Response } from "express";
import {
	DELETE_A_SUBSCRIPTION,
	PUBLISH_A_MESSAGE,
	SUBSCRIPTION_TO_A_TOPIC,
} from "../../../../src/messaging/transport/http.controller";
import { createMockDispatcher } from "../../../helpers/broker.helper";

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync:
		(fn: (...args: unknown[]) => Promise<unknown>) =>
		async (...args: unknown[]): Promise<void> => {
			try {
				await fn(...args);
			} catch (err) {
				const next = args[2] as (err?: unknown) => void;
				next(err);
			}
		},
}));

describe("HTTP Controller", () => {
	let mockDispatcher: ReturnType<typeof createMockDispatcher>;

	beforeEach(() => {
		mockDispatcher = createMockDispatcher();
	});

	describe("SUBSCRIPTION_TO_A_TOPIC", () => {
		it("should call dispatcher.subscribe with valid body", async () => {
			const handler = SUBSCRIPTION_TO_A_TOPIC(mockDispatcher as never);
			const req = {
				body: {
					topic: "test.topic",
					callbackPath: "message/callback",
					consumerIdentity: {
						serviceName: ServiceInstanceName.FinancialScraperService,
						instanceId: "instance-1",
					},
				},
			} as Request;

			await handler(req, {} as Response, jest.fn());

			expect(mockDispatcher.subscribe).toHaveBeenCalledWith(req.body);
		});

		it("should return error on invalid body", async () => {
			const handler = SUBSCRIPTION_TO_A_TOPIC(mockDispatcher as never);

			await handler(
				{ body: { topic: "" } } as Request,
				{} as Response,
				jest.fn()
			);

			expect(mockDispatcher.subscribe).not.toHaveBeenCalled();
		});
	});

	describe("DELETE_A_SUBSCRIPTION", () => {
		it("should call dispatcher.unsubscribe with valid body", async () => {
			const handler = DELETE_A_SUBSCRIPTION(mockDispatcher as never);
			const req = {
				body: { topic: "test.topic", instanceId: "instance-1" },
			} as Request;

			await handler(req, {} as Response, jest.fn());

			expect(mockDispatcher.unsubscribe).toHaveBeenCalledWith(req.body);
		});

		it("should return error on invalid body", async () => {
			const handler = DELETE_A_SUBSCRIPTION(mockDispatcher as never);

			await handler(
				{ body: { topic: "" } } as Request,
				{} as Response,
				jest.fn()
			);

			expect(mockDispatcher.unsubscribe).not.toHaveBeenCalled();
		});
	});

	describe("PUBLISH_A_MESSAGE", () => {
		it("should call dispatcher.publish with valid body", async () => {
			const handler = PUBLISH_A_MESSAGE(mockDispatcher as never);
			const req = {
				body: {
					payload: { key: "value" },
					metadata: {
						schemaVersion: "1.0",
						eventType: "TestEvent",
						topic: "test.topic",
						publisher: {
							serviceName: ServiceInstanceName.FinancialScraperService,
							instanceId: "instance-1",
						},
					},
				},
			} as Request;

			await handler(req, {} as Response, jest.fn());

			expect(mockDispatcher.publish).toHaveBeenCalled();
		});

		it("should return error on invalid body", async () => {
			const handler = PUBLISH_A_MESSAGE(mockDispatcher as never);
			const req = { body: { payload: {} } } as Request;

			await handler(req, {} as Response, jest.fn());

			expect(mockDispatcher.publish).not.toHaveBeenCalled();
		});
	});
});
