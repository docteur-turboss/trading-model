import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { responseIssues } from "@trading-model/http/api-route/api-route";
import { getCorrelationId } from "@trading-model/http/correlation-id";
import express from "express";
import { BROKER_CALLBACK_API } from "../../src/api-routes";
import { EVENT_MANAGER } from "../../src/event-manager-client";
import { CREATE_CALLBACK_ROUTE } from "../../src/messages.routes";

const METADATA = {
	topic: "market.candlestick.series.fetch",
	eventType: "market.candlestick.series.fetch",
	publisher: {
		serviceName: ServiceInstanceName.AuditLoggerService,
		instanceId: "550e8400-e29b-41d4-a716-446655440000",
	},
	schemaVersion: "1.0.0",
};

/** Mounts the callback route like MessageManagerListenExpress and POSTs `body` to `path`. */
async function deliver(
	callbackPath: string,
	path: string,
	body: unknown = { metadata: METADATA, payload: { candle: [] } }
): Promise<{ status: number; body: unknown }> {
	const app = express();
	app.use(express.json());
	app.use(CREATE_CALLBACK_ROUTE(callbackPath));
	const server = app.listen(0);
	try {
		const { port } = server.address() as AddressInfo;
		const res = await fetch(`http://127.0.0.1:${port}${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		const text = await res.text();
		const parsed = text.startsWith("{") ? JSON.parse(text) : text;
		// 500 (a throwing listener) is not a documented response.
		if (res.status !== 404 && res.status !== 500) {
			expect(
				responseIssues(BROKER_CALLBACK_API.receive, res.status, parsed)
			).toEqual([]);
		}
		return { status: res.status, body: parsed };
	} finally {
		server.close();
	}
}

describe("CREATE_CALLBACK_ROUTE (BROKER_CALLBACK_API.receive)", () => {
	beforeEach(() => {
		(EVENT_MANAGER as any)._emitter.removeAllListeners();
	});

	// The sender waits for this answer: no response = timeout, retries, DLQ.
	it("acknowledges the delivery and emits the payload to the topic's listeners", async () => {
		const listener = jest.fn<(...args: any[]) => any>();
		EVENT_MANAGER.on("market.candlestick.series.fetch" as never, listener);

		const { status, body } = await deliver("message", "/message");

		expect(status).toBe(200);
		expect(body).toEqual({ status: "delivered" });
		expect(listener).toHaveBeenCalledWith({ candle: [] });
	});

	it("runs the listeners in the correlation context of the message", async () => {
		let seen: string | undefined;
		EVENT_MANAGER.on("market.candlestick.series.fetch" as never, () => {
			seen = getCorrelationId();
		});
		const body = {
			metadata: {
				...METADATA,
				correlationId: "550e8400-e29b-41d4-a716-446655440000",
			},
			payload: { candle: [] },
		};

		expect((await deliver("message", "/message", body)).status).toBe(200);
		expect(seen).toBe("550e8400-e29b-41d4-a716-446655440000");
	});

	it("emits a redelivered messageId once and acknowledges both deliveries", async () => {
		const listener = jest.fn<(...args: any[]) => any>();
		EVENT_MANAGER.on("market.candlestick.series.fetch" as never, listener);
		const body = {
			metadata: {
				...METADATA,
				messageId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
			},
			payload: { candle: [] },
		};

		expect((await deliver("message", "/message", body)).status).toBe(200);
		expect((await deliver("message", "/message", body)).status).toBe(200);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("emits a redelivery again when a listener threw on the first delivery", async () => {
		const listener = jest
			.fn<(...args: any[]) => any>()
			.mockImplementationOnce(() => {
				throw new Error("listener failed");
			});
		EVENT_MANAGER.on("market.candlestick.series.fetch" as never, listener);
		const body = {
			metadata: {
				...METADATA,
				messageId: "c2f1a8d4-6b3e-4f95-9a07-1d8e5b4c3a26",
			},
			payload: { candle: [] },
		};

		expect((await deliver("message", "/message", body)).status).toBe(500);
		expect((await deliver("message", "/message", body)).status).toBe(200);
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("does not remember the messageId of an invalid payload", async () => {
		const listener = jest.fn<(...args: any[]) => any>();
		EVENT_MANAGER.on("market.candlestick.series.fetch" as never, listener);
		const metadata = {
			...METADATA,
			messageId: "0b9c1f3e-5d2a-4c7e-8a41-2f6d9e3b7a10",
		};

		expect(
			(
				await deliver("message", "/message", {
					metadata,
					payload: { invalid: 1 },
				})
			).status
		).toBe(400);
		expect(
			(
				await deliver("message", "/message", {
					metadata,
					payload: { candle: [] },
				})
			).status
		).toBe(200);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("rejects an envelope without metadata with 400", async () => {
		const { status, body } = await deliver("message", "/message", {
			payload: {},
		});

		expect(status).toBe(400);
		expect(body).toMatchObject({
			details: [expect.objectContaining({ field: "body.metadata" })],
		});
	});

	it("rejects a payload that does not match its topic with 400", async () => {
		const { status, body } = await deliver("message", "/message", {
			metadata: METADATA,
			payload: { invalid: "data" },
		});

		expect(status).toBe(400);
		expect(body).toEqual({ error: "Invalid payload format" });
	});

	// MESSAGE_CALLBACK_PATH defaults to "message": without the leading slash
	// Express never matched it, so every delivery got a 404.
	it("accepts a callback path given with its leading slash", async () => {
		expect((await deliver("/custom-path", "/custom-path")).status).toBe(200);
	});

	it("does not route other paths", async () => {
		expect((await deliver("message", "/other")).status).toBe(404);
	});
});
