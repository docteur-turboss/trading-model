import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	type ApiRoute,
	responseIssues,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import express from "express";
import { BROKER_API } from "../../../../src/adapters/inbound/api-routes";
import { BROKER_ROUTES } from "../../../../src/adapters/inbound/http.routes";
import { createMockDispatcher } from "../../../helpers/broker.helper";

const PUBLISHER = {
	serviceName: ServiceInstanceName.FinancialScraperService,
	instanceId: "scraper-1",
};

describe("message-manager API (BROKER_API)", () => {
	const dispatcher = createMockDispatcher();
	let server: Server;
	let baseUrl: string;

	beforeAll(async () => {
		const app = express();
		app.use(express.json());
		app.use(BROKER_ROUTES(dispatcher as never));
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		dispatcher.publish.mockClear();
		dispatcher.subscribe.mockClear();
		dispatcher.unsubscribe.mockClear();
	});

	/** Sends the body to the route, checks the response against its entry. */
	async function call(route: ApiRoute, body: unknown) {
		const res = await fetch(`${baseUrl}${route.path}`, {
			method: route.method,
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		const text = await res.text();
		const parsed = text ? JSON.parse(text) : undefined;
		expect(responseIssues(route, res.status, parsed)).toEqual([]);
		return { status: res.status, body: parsed };
	}

	describe("POST /message", () => {
		it("hands payload and parsed metadata to the dispatcher", async () => {
			const { status, body: accepted } = await call(BROKER_API.publish, {
				payload: { close: 1 },
				metadata: {
					schemaVersion: "1.0",
					eventType: "candles",
					topic: "market.candles.fetch",
					publisher: PUBLISHER,
				},
			});

			expect(status).toBe(202);
			expect(accepted).toEqual({ messageId: "message-id" });
			expect(dispatcher.publish).toHaveBeenCalledWith(
				{ close: 1 },
				expect.objectContaining({
					topic: "market.candles.fetch",
					schemaVersion: "1.0.0",
					publisher: PUBLISHER,
				})
			);
		});

		it("rejects metadata without topic or from an unknown service with 400", async () => {
			const { status, body } = await call(BROKER_API.publish, {
				payload: {},
				metadata: {
					schemaVersion: "1.0",
					eventType: "candles",
					publisher: { ...PUBLISHER, serviceName: "rogue" },
				},
			});

			expect(status).toBe(400);
			expect(body.details.map((d: { field: string }) => d.field)).toEqual(
				expect.arrayContaining([
					"body.metadata.topic",
					"body.metadata.publisher.serviceName",
				])
			);
			expect(dispatcher.publish).not.toHaveBeenCalled();
		});
	});

	describe("POST /subscribe", () => {
		it("subscribes the instance", async () => {
			const subscription = {
				topic: "market.candles.fetch",
				callbackPath: "message",
				serviceIdentity: PUBLISHER,
			};

			const { status } = await call(BROKER_API.subscribe, subscription);

			expect(status).toBe(204);
			expect(dispatcher.subscribe).toHaveBeenCalledWith(subscription);
		});

		it("rejects a subscription without callback path with 400", async () => {
			const { status } = await call(BROKER_API.subscribe, {
				topic: "market.candles.fetch",
				serviceIdentity: PUBLISHER,
			});

			expect(status).toBe(400);
			expect(dispatcher.subscribe).not.toHaveBeenCalled();
		});
	});

	describe("DELETE /subscribe", () => {
		it("removes the subscription", async () => {
			const { status } = await call(BROKER_API.unsubscribe, {
				topic: "market.candles.fetch",
				instanceId: "scraper-1",
			});

			expect(status).toBe(204);
			expect(dispatcher.unsubscribe).toHaveBeenCalledWith({
				topic: "market.candles.fetch",
				instanceId: "scraper-1",
			});
		});

		it("rejects an empty instance id with 400", async () => {
			const { status } = await call(BROKER_API.unsubscribe, {
				topic: "market.candles.fetch",
				instanceId: "",
			});

			expect(status).toBe(400);
		});
	});
});
