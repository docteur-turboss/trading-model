import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import {
	type ApiRoute,
	responseIssues,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import express from "express";

import { AUDIT_API } from "../../../src/adapters/inbound/http/api-routes";
import { eventsRoutes } from "../../../src/adapters/inbound/http/events.routes";

const RECEIVED = new Date("2026-10-28T12:00:00.000Z");

/** A document as MongoDB returns it (ObjectId, Dates). */
const EVENT = {
	_id: { toJSON: () => "6720f0aa0000000000000001" },
	receivedAt: RECEIVED,
	ttl: new Date("2027-10-28T12:00:00.000Z"),
	dataHash: "a".repeat(64),
	previousHash: "b".repeat(64),
	chainSequence: 7,
	metadata: {
		topic: "market.candles.fetch",
		eventType: "candles",
		publisher: "financial-scraper-service",
		instanceId: "financial-scraper-1",
		messageId: "m-1",
		correlationId: "c-1",
	},
	payload: { close: 1 },
};

const auditRepo = {
	query: jest.fn<(...args: any[]) => any>(),
	findById: jest.fn<(...args: any[]) => any>(),
	getStats: jest.fn<(...args: any[]) => any>(),
};

describe("audit-logger HTTP API (AUDIT_API)", () => {
	let server: Server;
	let baseUrl: string;

	beforeAll(async () => {
		const app = express();
		app.use(eventsRoutes(auditRepo as never));
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	/** GET the path, check the response against the route's entry. */
	async function get(route: ApiRoute, path: string) {
		const res = await fetch(`${baseUrl}${path}`);
		const body = await res.json();
		expect(responseIssues(route, res.status, body)).toEqual([]);
		return { status: res.status, body };
	}

	describe("GET /events", () => {
		it("passes the filters to the repository and answers a page", async () => {
			auditRepo.query.mockResolvedValue({
				docs: [EVENT],
				total: 1,
				page: 2,
				limit: 10,
			});

			const { status, body } = await get(
				AUDIT_API.listEvents,
				"/events?topic=market.candles.fetch&publisher=financial-scraper-service" +
					"&correlationId=c-1&startDate=2026-10-01&endDate=2026-10-28T23:59:59Z&page=2&limit=10"
			);

			expect(status).toBe(200);
			expect(body.docs[0]).toMatchObject({
				_id: "6720f0aa0000000000000001",
				receivedAt: RECEIVED.toISOString(),
			});
			expect(auditRepo.query).toHaveBeenCalledWith({
				topic: "market.candles.fetch",
				publisher: "financial-scraper-service",
				correlationId: "c-1",
				dateRange: expect.objectContaining({
					start: new Date("2026-10-01"),
					end: new Date("2026-10-28T23:59:59Z"),
				}),
				page: 2,
				limit: 10,
				withTotal: true,
			});
		});

		it("leaves out the empty filters and caps the limit at 1000", async () => {
			auditRepo.query.mockResolvedValue({
				docs: [],
				total: 0,
				page: 1,
				limit: 1000,
			});

			await get(AUDIT_API.listEvents, "/events?topic=&limit=5000");

			expect(auditRepo.query).toHaveBeenCalledWith({
				topic: undefined,
				publisher: undefined,
				correlationId: undefined,
				dateRange: undefined,
				page: undefined,
				limit: 1000,
				withTotal: true,
			});
		});

		it("passes withTotal=false to the repository", async () => {
			auditRepo.query.mockResolvedValue({ docs: [], page: 1, limit: 100 });

			await get(AUDIT_API.listEvents, "/events?withTotal=false");

			expect(auditRepo.query).toHaveBeenCalledWith(
				expect.objectContaining({ withTotal: false })
			);
		});

		it.each([
			["a non-numeric page", "page=abc", "query.page"],
			["a page below 1", "page=0", "query.page"],
			["a non-numeric limit", "limit=abc", "query.limit"],
			["an unparsable date", "startDate=yesterday", "query.startDate"],
		])("rejects %s with 400 before querying", async (_label, qs, field) => {
			const { status, body } = await get(AUDIT_API.listEvents, `/events?${qs}`);

			expect(status).toBe(400);
			expect(body.details).toEqual([expect.objectContaining({ field })]);
			expect(auditRepo.query).not.toHaveBeenCalled();
		});
	});

	describe("GET /events/stats", () => {
		it("answers the counts and the date range", async () => {
			auditRepo.getStats.mockResolvedValue({
				totalEvents: 3,
				eventsByTopic: { "market.candles.fetch": 3 },
				eventsByPublisher: { "financial-scraper-service": 3 },
				dateRange: { earliest: RECEIVED, latest: RECEIVED },
			});

			const { status } = await get(AUDIT_API.getStats, "/events/stats");

			expect(status).toBe(200);
		});

		it("answers null bounds when there is no event", async () => {
			auditRepo.getStats.mockResolvedValue({
				totalEvents: 0,
				eventsByTopic: {},
				eventsByPublisher: {},
				dateRange: { earliest: null, latest: null },
			});

			expect((await get(AUDIT_API.getStats, "/events/stats")).status).toBe(200);
		});
	});

	describe("GET /events/:messageId", () => {
		it("answers the event", async () => {
			auditRepo.findById.mockResolvedValue(EVENT);

			const { status } = await get(AUDIT_API.getEvent, "/events/m-1");

			expect(status).toBe(200);
			expect(auditRepo.findById).toHaveBeenCalledWith("m-1");
		});

		it("answers 404 for an unknown id", async () => {
			auditRepo.findById.mockResolvedValue(null);

			const { status, body } = await get(AUDIT_API.getEvent, "/events/unknown");

			expect(status).toBe(404);
			expect(body).toEqual({ error: "Event not found" });
		});
	});
});
