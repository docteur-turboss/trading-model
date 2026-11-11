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
import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import express, { Router } from "express";
import { DLQ_API } from "../../src/adapters/inbound/api-routes";

/**
 * `GET /dlq` is public through the gateway: a MongoDB operator in the query
 * string must never reach the store as an object (issue #648).
 */
const listEntries = jest.fn<(...args: any[]) => any>();
const PARAMS = ["topic", "limit", "offset", "cursor"];
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

describe("GET /dlq operator injection", () => {
	let server: Server;
	let baseUrl: string;

	beforeAll(async () => {
		const router = Router();
		mountRoute(router, DLQ_API.listEntries, ({ query }) => listEntries(query));
		const app = express();
		app.use(router);
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		listEntries.mockReset();
		listEntries.mockResolvedValue({
			status: 200,
			body: { entries: [], count: 0, hasMore: false },
		});
	});

	it.each(PARAMS.flatMap((p) => OPERATORS.map((op) => op(p))))(
		"rejects or neutralises %s",
		async (qs) => {
			const res = await fetch(`${baseUrl}/dlq?${qs}`);
			expect(res.status).not.toBe(500);
			for (const [query] of listEntries.mock.calls) {
				for (const value of Object.values(query as Record<string, unknown>)) {
					expect(["string", "number", "undefined"]).toContain(typeof value);
				}
			}
		}
	);

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
		];
		for (let i = 0; i < 60; i++) {
			const p = pick(PARAMS);
			const qs =
				rand() < 0.5
					? `${p}[]=${pick(junk)}&${p}[]=${pick(junk)}`
					: `${p}[a][b]=${pick(junk)}`;
			const res = await fetch(`${baseUrl}/dlq?${qs}`);
			expect(res.status).toBeLessThan(500);
		}
	});
});
