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
import express from "express";

import { eventsRoutes } from "../../../src/adapters/inbound/http/events.routes";

/**
 * Public routes (gateway PUBLIC_ROUTES): a MongoDB operator in a query or path
 * parameter must be refused or reach the repository as a literal string
 * (issue #648).
 */
const auditRepo = {
	query: jest.fn<(...args: any[]) => any>(),
	findById: jest.fn<(...args: any[]) => any>(),
	getStats: jest.fn<(...args: any[]) => any>(),
};
const PARAMS = [
	"topic",
	"publisher",
	"correlationId",
	"startDate",
	"endDate",
	"page",
	"limit",
];
const OPERATORS = [
	(p: string) => `${p}[$ne]=x`,
	(p: string) => `${p}[$gt]=`,
	(p: string) => `${p}[$where]=1`,
	(p: string) => `${p}[$regex]=.*`,
	(p: string) => `${p}=${encodeURIComponent('{"$ne":null}')}`,
];

/** Deterministic PRNG (mulberry32): no Math.random in tests. */
function prng(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe("audit-logger public routes: operator injection", () => {
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
		auditRepo.query.mockResolvedValue({
			docs: [],
			total: 0,
			page: 1,
			limit: 10,
		});
		auditRepo.findById.mockResolvedValue(null);
		auditRepo.getStats.mockResolvedValue({});
	});

	it.each(PARAMS.flatMap((p) => OPERATORS.map((op) => op(p))))(
		"GET /events?%s never gives the repository an operator object",
		async (qs) => {
			const res = await fetch(`${baseUrl}/events?${qs}`);
			expect(res.status).not.toBe(500);
			for (const [filter] of auditRepo.query.mock.calls) {
				for (const key of ["topic", "publisher", "correlationId"]) {
					expect(["string", "undefined"]).toContain(
						typeof (filter as any)[key]
					);
				}
			}
		}
	);

	it("GET /events/:messageId with an operator is a 400/404, never a document", async () => {
		const res = await fetch(
			`${baseUrl}/events/${encodeURIComponent('{"$ne":null}')}`
		);
		expect([400, 404]).toContain(res.status);
		for (const [id] of auditRepo.findById.mock.calls) {
			expect(typeof id).toBe("string");
		}
	});

	it("GET /events/stats ignores a hostile query", async () => {
		const res = await fetch(`${baseUrl}/events/stats?topic[$ne]=x&$where=1`);
		expect(res.status).toBe(200);
		expect(auditRepo.getStats).toHaveBeenCalledWith();
	});

	it("never answers 500 on seeded fuzz of the query", async () => {
		const rand = prng(648);
		const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
		const junk = [
			"",
			"x",
			"-1",
			"1e9",
			"[]",
			"{}",
			"a".repeat(5000),
			"%00",
			"$ne",
			"2026-13-45",
		];
		for (let i = 0; i < 80; i++) {
			const p = pick(PARAMS);
			const qs =
				rand() < 0.5
					? `${p}[]=${pick(junk)}&${p}[]=${pick(junk)}`
					: `${p}[a][b]=${pick(junk)}`;
			const res = await fetch(`${baseUrl}/events?${qs}`);
			expect(res.status).toBeLessThan(500);
		}
	});
});
