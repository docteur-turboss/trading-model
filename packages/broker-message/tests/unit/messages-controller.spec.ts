import { describe, expect, it, jest } from "@jest/globals";
import { getCorrelationId } from "@trading-model/http/correlation-id";

import {
	type DeliveredMessage,
	deliverToHandler,
} from "../../src/messages.controller";

const heartbeat = (messageId: string, correlationId?: string) => ({
	metadata: { topic: "audit.heartbeat", messageId, correlationId },
	payload: { serviceName: "audit-logger", instanceId: "inst-1" },
});

describe("deliverToHandler", () => {
	it("should refuse a payload that does not match its topic, without calling the handler", async () => {
		const handle = jest.fn<(message: DeliveredMessage) => Promise<void>>();
		const ok = await deliverToHandler(
			{ metadata: { topic: "audit.heartbeat" }, payload: {} },
			handle
		);
		expect(ok).toBe(false);
		expect(handle).not.toHaveBeenCalled();
	});

	it("should handle a messageId once, in its correlation context", async () => {
		const seen: (string | undefined)[] = [];
		const handle = jest.fn(async (_message: DeliveredMessage) => {
			seen.push(getCorrelationId());
		});
		expect(await deliverToHandler(heartbeat("m-1", "c-1"), handle)).toBe(true);
		expect(await deliverToHandler(heartbeat("m-1", "c-1"), handle)).toBe(true);
		expect(handle).toHaveBeenCalledTimes(1);
		expect(seen).toEqual(["c-1"]);
	});

	it("should let a message whose handler threw be delivered again", async () => {
		const handle = jest
			.fn<(message: DeliveredMessage) => Promise<void>>()
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValueOnce(undefined);
		await expect(deliverToHandler(heartbeat("m-2"), handle)).rejects.toThrow(
			"boom"
		);
		expect(await deliverToHandler(heartbeat("m-2"), handle)).toBe(true);
		expect(handle).toHaveBeenCalledTimes(2);
	});
});
