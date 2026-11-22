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
} from "@trading-model/http/api-route/api-route";
import { InstanceId, Topic } from "@trading-model/primitives/primitives";
import express from "express";
import { BROKER_API } from "../../../../src/adapters/inbound/api-routes";
import { BROKER_ROUTES } from "../../../../src/adapters/inbound/http.routes";
import { createMockDispatcher } from "../../../helpers/broker.helper";

const SCRAPER_SVID =
	"spiffe://trading-model.local/ns/trading-model/sa/financial-scraper";
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
		// The SVID mTLS auth sets: the caller is financial-scraper.
		app.use((req, _res, next) => {
			(req as { clientIdentity?: string }).clientIdentity = SCRAPER_SVID;
			next();
		});
		app.use(BROKER_ROUTES(dispatcher as never));
		// Thrown ResponseException: the status and body of the error handler of the real server.
		app.use(
			(
				err: { status: number; data: unknown },
				_req: express.Request,
				res: express.Response,
				_next: express.NextFunction
			) => {
				res.status(err.status).json(err.data);
			}
		);
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

		it("rejects with 403 a publisher that is not the calling service", async () => {
			const { status } = await call(BROKER_API.publish, {
				payload: {},
				metadata: {
					schemaVersion: "1.0",
					eventType: "training.model.published",
					topic: "training.model.published",
					publisher: {
						...PUBLISHER,
						serviceName: ServiceInstanceName.TraderTrainerService,
					},
				},
			});

			expect(status).toBe(403);
			expect(dispatcher.publish).not.toHaveBeenCalled();
		});

		it("rejects with 403 a topic the calling service may not publish", async () => {
			const { status } = await call(BROKER_API.publish, {
				payload: {},
				metadata: {
					schemaVersion: "1.0",
					eventType: "training.model.published",
					topic: "training.model.published",
					publisher: PUBLISHER,
				},
			});

			expect(status).toBe(403);
			expect(dispatcher.publish).not.toHaveBeenCalled();
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
			expect(dispatcher.subscribe).toHaveBeenCalledWith(subscription as never);
		});

		it("rejects with 403 a service identity that is not the calling service", async () => {
			const { status } = await call(BROKER_API.subscribe, {
				topic: "training.model.published",
				callbackPath: "message",
				serviceIdentity: {
					...PUBLISHER,
					serviceName: ServiceInstanceName.ModelEvaluatorService,
				},
			});

			expect(status).toBe(403);
			expect(dispatcher.subscribe).not.toHaveBeenCalled();
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
			expect(dispatcher.unsubscribe).toHaveBeenCalledWith(
				{
					topic: Topic.of("market.candles.fetch"),
					instanceId: InstanceId.of("scraper-1"),
				},
				ServiceInstanceName.FinancialScraperService
			);
		});

		it("rejects with 403 an instance of another service", async () => {
			dispatcher.unsubscribe.mockResolvedValueOnce(false);

			const { status } = await call(BROKER_API.unsubscribe, {
				topic: "market.candles.fetch",
				instanceId: "audit-1",
			});

			expect(status).toBe(403);
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
