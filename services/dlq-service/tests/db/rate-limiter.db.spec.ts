import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
} from "@jest/globals";
import express from "express";
import type rateLimit from "express-rate-limit";
import { Redis } from "ioredis";
import {
	_createHealthLimiter,
	_createReplayLimiter,
	_createWriteLimiter,
	closeRedisClient,
} from "../../src/adapters/inbound/rate-limiter";

type Limiter = ReturnType<typeof rateLimit>;

const ok: express.RequestHandler = (_req, res) => {
	res.sendStatus(200);
};

let redis: Redis;
let servers: Server[] = [];

/** One dlq-service replica: its own limiters, as DlqRoutes() builds them. */
async function replica(): Promise<string> {
	const limiters: Record<string, Limiter> = {
		replay: _createReplayLimiter(),
		write: _createWriteLimiter(),
		health: _createHealthLimiter(),
	};
	const app = express();
	for (const [path, limiter] of Object.entries(limiters)) {
		app.get(`/${path}`, limiter, ok);
	}
	const server = app.listen(0);
	await new Promise((resolve) => server.once("listening", resolve));
	servers.push(server);
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function hit(
	base: string,
	path: string,
	times: number
): Promise<number[]> {
	const statuses: number[] = [];
	for (let i = 0; i < times; i++) {
		statuses.push((await fetch(`${base}/${path}`)).status);
	}
	return statuses;
}

beforeEach(async () => {
	redis = new Redis(process.env.TEST_REDIS_URL as string);
	const keys = await redis.keys("rl:*");
	if (keys.length > 0) {
		await redis.del(...keys);
	}
});

afterEach(async () => {
	await Promise.all(
		servers.map((server) => new Promise((resolve) => server.close(resolve)))
	);
	servers = [];
	redis.disconnect();
});

afterAll(async () => {
	await closeRedisClient();
});

describe("DLQ rate limiters — real Redis", () => {
	it("should keep the budget of each limiter apart", async () => {
		const base = await replica();

		// Liveness probes come from the same address as an operator replay.
		expect(await hit(base, "health", 20)).toEqual(new Array(20).fill(200));
		expect(await hit(base, "replay", 1)).toEqual([200]);
	});

	it("should not stretch the one-second write window to the replay window", async () => {
		const base = await replica();

		await hit(base, "replay", 1);
		expect(await hit(base, "write", 100)).toEqual(new Array(100).fill(200));
		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect(await hit(base, "write", 1)).toEqual([200]);
	});

	it("should share the replay budget between replicas", async () => {
		const first = await replica();
		const second = await replica();

		expect(await hit(first, "replay", 5)).toEqual(new Array(5).fill(200));
		expect(await hit(second, "replay", 5)).toEqual(new Array(5).fill(200));
		expect(await hit(first, "replay", 1)).toEqual([429]);
		expect(await hit(second, "replay", 1)).toEqual([429]);
	});
});
