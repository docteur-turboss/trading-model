import http from "node:http";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { buildSignedHeaders } from "@trading-model/crypto/application/services/request-signer";
import {
	type ApiRoute,
	responseIssues,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import express from "express";

jest.setTimeout(15000);

const HMAC_SECRET = "test-secret-16-chars";
const ALLOWED_SERVICE = "message-manager";

jest.mock("express-rate-limit", () => {
	return () => {
		const fn: Record<string, unknown> = (() => {}) as unknown as Record<
			string,
			unknown
		>;
		fn.resetKey = jest.fn();
		return fn as ReturnType<typeof import("express-rate-limit")>;
	};
});

jest.mock("../../src/adapters/inbound/rate-limiter", () => ({
	_createReplayLimiter:
		() => (_req: unknown, _res: unknown, next: () => void) =>
			next(),
	_createWriteLimiter: () => (_req: unknown, _res: unknown, next: () => void) =>
		next(),
	_createHealthLimiter:
		() => (_req: unknown, _res: unknown, next: () => void) =>
			next(),
	closeRateLimiters: jest.fn(),
}));

jest.mock("@trading-model/http/adapters/outbound/http-client", () => ({
	HttpClient: jest.fn(),
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/audit", () => ({
	publishDlqEvent: jest.fn(),
}));

jest.mock("../../src/config/db", () => ({
	isDbConnected: () => true,
	getCollection: jest.fn(),
	getMissingCriticalIndexes: () => [],
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: {
		push: jest.fn().mockResolvedValue(true),
		isAvailable: () => true,
	},
}));

jest.mock("../../src/config/metrics", () => ({
	metricsHandler: jest.fn(),
	metrics: {
		entriesAdded: { inc: jest.fn() },
		entriesDeleted: { inc: jest.fn() },
		entriesReplayed: { inc: jest.fn() },
		entriesReplayFailed: { inc: jest.fn() },
		entriesPruned: { inc: jest.fn() },
		pruneErrors: { inc: jest.fn() },
		entrySizeBytes: { observe: jest.fn() },
		collectionSize: { set: jest.fn() },
	},
}));

jest.mock("../../src/adapters/outbound/repository", () => ({
	dlqRepository: {
		insert: jest.fn(),
		query: jest.fn(),
		delete: jest.fn(),
		count: jest.fn(),
		prune: jest.fn(),
		listQueuable: jest.fn(),
	},
}));

jest.mock("../../src/adapters/outbound/claim-manager", () => ({
	dlqClaimManager: {
		claimEntriesForRetry: jest.fn(),
		releaseStaleClaims: jest.fn(),
		releaseClaimWithoutCount: jest.fn(),
		incrementRetryCount: jest.fn(),
		releaseClaimsByInstance: jest.fn(),
	},
	claimReleaseManager: { releaseStaleClaims: jest.fn() },
}));

jest.mock("../../src/adapters/outbound/retry-manager", () => ({
	dlqRetryManager: {
		markRetried: jest.fn(),
		abandonExhaustedEntries: jest.fn(),
	},
}));

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn(),
	AddressManager: { start: jest.fn() },
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
		DLQ_ALLOWED_SERVICES: "message-manager,admin",
		MAX_ENTRIES: 100,
		MESSAGE_MANAGER_URL: "https://message-manager:3000",
		MONGO_URI: "mongodb://localhost:27017/test",
		MONGO_DB: "test",
		MONGO_COLLECTION: "test_collection",
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		TLS_CA_PATH: "",
		TLS_CERT_PATH: "",
		TLS_KEY_PATH: "",
		REDIS_URL: "",
		DLQ_PRUNE_INTERVAL_MS: 60000,
		DLQ_AUTO_RETRY_ENABLED: false,
		DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
		DLQ_AUTO_RETRY_LIMIT: 50,
		INSTANCE_ID: "dlq-service-test-1",
	},
	resolveAuthHmacSecret: () => "test-secret-16-chars",
}));

import { DLQ_API } from "../../src/adapters/inbound/api-routes";
import { DlqRoutes } from "../../src/adapters/inbound/routes";
import { dlqClaimManager } from "../../src/adapters/outbound/claim-manager";
import { dlqRepository } from "../../src/adapters/outbound/repository";

/** Every API response must match its registry entry (ADR-0021). */
function expectDocumented(
	route: ApiRoute,
	result: { status: number; body: unknown }
): void {
	expect(responseIssues(route, result.status, result.body)).toEqual([]);
}

const validEntry = {
	topic: "test.topic",
	message: { key: "value", sequence: 1 },
	reason: "integration test",
	deliveryAttempt: 1,
	timestamp: new Date().toISOString(),
};

function signHeaders(
	body: unknown,
	method: string,
	path: string,
	serviceName = ALLOWED_SERVICE
): Record<string, string> {
	const headers = buildSignedHeaders(
		{ serviceName, method, path, body } as never,
		HMAC_SECRET
	);
	return {
		"x-service-name": String(headers["x-service-name"]),
		"x-signature": String(headers["x-signature"]),
		"x-timestamp": String(headers["x-timestamp"]),
		"Content-Type": "application/json",
		Connection: "close",
	};
}

interface RequestOptions {
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
}

function createApp(): express.Application {
	const app = express();
	app.use(express.json());
	app.use("/", DlqRoutes());
	return app;
}

function request(
	server: http.Server,
	path: string,
	options: RequestOptions = {}
): Promise<{ status: number; body: unknown }> {
	return new Promise((resolve, reject) => {
		const addr = server.address();
		if (!addr || typeof addr === "string") {
			reject(new Error("Server not listening"));
			return;
		}
		const data = options.body ? JSON.stringify(options.body) : undefined;
		const req = http.request(
			{
				hostname: "localhost",
				port: addr.port,
				path,
				method: options.method ?? "GET",
				headers: {
					Connection: "close",
					...(data
						? { "Content-Length": Buffer.byteLength(data).toString() }
						: {}),
					...(options.headers ?? {}),
				},
			},
			(res) => {
				let raw = "";
				res.on("data", (chunk: Buffer) => {
					raw += chunk.toString();
				});
				res.on("end", () => {
					try {
						resolve({ status: res.statusCode ?? 500, body: JSON.parse(raw) });
					} catch {
						resolve({ status: res.statusCode ?? 500, body: raw });
					}
				});
				res.on("error", reject);
			}
		);
		req.on("error", reject);
		if (data) {
			req.write(data);
		}
		req.end();
	});
}

describe("DLQ Service — Routes Integration", () => {
	let server: http.Server;

	beforeEach(() => {
		(dlqRepository.insert as jest.Mock).mockResolvedValue("entry-1");
		(dlqRepository.query as jest.Mock).mockResolvedValue([]);
		(dlqRepository.count as jest.Mock).mockResolvedValue(5);
	});

	afterEach(() => {
		jest.clearAllMocks();
		return new Promise<void>((resolve) => {
			if (server?.listening) {
				server.closeAllConnections();
				server.close(() => resolve());
			} else {
				resolve();
			}
		});
	});

	async function start(): Promise<void> {
		const app = createApp();
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
	}

	it("GET /health should report the stored entry count", async () => {
		await start();
		const result = await request(server, "/health");
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ status: "ok", entries: 5 });
	});

	it("GET /health/ready should report readiness", async () => {
		await start();
		const result = await request(server, "/health/ready");
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			status: "ready",
			redis: "connected",
		});
	});

	it("POST /dlq should reject a request without a service identity", async () => {
		await start();
		const result = await request(server, "/dlq", {
			method: "POST",
			body: validEntry,
		});
		expect(result.status).toBe(403);
		expect(result.body).toEqual({ error: "Unauthorized service" });
		expectDocumented(DLQ_API.addEntry, result);
		expect(dlqRepository.insert).not.toHaveBeenCalled();
	});

	it("POST /dlq should reject a service that is not allowed", async () => {
		await start();
		const result = await request(server, "/dlq", {
			method: "POST",
			body: validEntry,
			headers: signHeaders(validEntry, "POST", "/dlq", "rogue-service"),
		});
		expect(result.status).toBe(403);
		expect(dlqRepository.insert).not.toHaveBeenCalled();
	});

	it("POST /dlq should reject an invalid signature", async () => {
		await start();
		const result = await request(server, "/dlq", {
			method: "POST",
			body: validEntry,
			headers: {
				...signHeaders(validEntry, "POST", "/dlq"),
				"x-signature": "0".repeat(64),
			},
		});
		expect(result.status).toBe(401);
		expect(result.body).toEqual({ error: "Invalid or expired signature" });
		expectDocumented(DLQ_API.addEntry, result);
		expect(dlqRepository.insert).not.toHaveBeenCalled();
	});

	it("POST /dlq should persist a validly signed entry", async () => {
		await start();
		const result = await request(server, "/dlq", {
			method: "POST",
			body: validEntry,
			headers: signHeaders(validEntry, "POST", "/dlq"),
		});
		expect(result.status).toBe(201);
		expect(result.body).toEqual({ id: "entry-1" });
		expectDocumented(DLQ_API.addEntry, result);
		expect(dlqRepository.insert).toHaveBeenCalledTimes(1);
	});

	it("POST /dlq should reject an invalid body with 400", async () => {
		await start();
		const invalidBody = { reason: "missing required fields" };
		const result = await request(server, "/dlq", {
			method: "POST",
			body: invalidBody,
			headers: signHeaders(invalidBody, "POST", "/dlq"),
		});
		expect(result.status).toBe(400);
		expect(result.body).toEqual({
			error: "Validation failed",
			details: expect.arrayContaining([
				expect.objectContaining({ field: "body.deliveryAttempt" }),
				expect.objectContaining({ field: "body.timestamp" }),
			]),
		});
		expectDocumented(DLQ_API.addEntry, result);
		expect(dlqRepository.insert).not.toHaveBeenCalled();
	});

	it("POST /dlq should accept the contract format (epoch milliseconds)", async () => {
		await start();
		const entry = { ...validEntry, timestamp: Date.now() };
		const result = await request(server, "/dlq", {
			method: "POST",
			body: entry,
			headers: signHeaders(entry, "POST", "/dlq"),
		});
		expect(result.status).toBe(201);
		expect(dlqRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({ timestamp: entry.timestamp })
		);
	});

	it("GET /dlq should list entries for an allowed service", async () => {
		(dlqRepository.query as jest.Mock).mockResolvedValue([
			{
				id: "entry-1",
				topic: "test.topic",
				message: { key: "value" },
				reason: "integration test",
				deliveryAttempt: 1,
				createdAt: new Date().toISOString(),
			},
		]);
		await start();
		const result = await request(server, "/dlq", {
			headers: signHeaders(null, "GET", "/dlq"),
		});
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ count: 1, hasMore: false });
		expect((result.body as { entries: unknown[] }).entries).toHaveLength(1);
		expectDocumented(DLQ_API.listEntries, result);
	});

	it("GET /dlq should reject an invalid query with 400", async () => {
		await start();
		const result = await request(server, "/dlq?limit=abc", {
			headers: signHeaders(null, "GET", "/dlq?limit=abc"),
		});
		expect(result.status).toBe(400);
		expectDocumented(DLQ_API.listEntries, result);
		expect(dlqRepository.query).not.toHaveBeenCalled();
	});

	it("DELETE /dlq should delete the given ids", async () => {
		(dlqRepository.delete as jest.Mock).mockResolvedValue(2);
		await start();
		const body = { ids: ["a", "b"] };
		const result = await request(server, "/dlq", {
			method: "DELETE",
			body,
			headers: signHeaders(body, "DELETE", "/dlq"),
		});
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ deleted: 2 });
		expectDocumented(DLQ_API.deleteEntries, result);
	});

	it("DELETE /dlq should reject an empty id list with 400", async () => {
		await start();
		const body = { ids: [] };
		const result = await request(server, "/dlq", {
			method: "DELETE",
			body,
			headers: signHeaders(body, "DELETE", "/dlq"),
		});
		expect(result.status).toBe(400);
		expectDocumented(DLQ_API.deleteEntries, result);
		expect(dlqRepository.delete).not.toHaveBeenCalled();
	});

	it("POST /dlq/replay should answer when nothing is waiting", async () => {
		(dlqClaimManager.claimEntriesForRetry as jest.Mock).mockResolvedValue([]);
		await start();
		const result = await request(server, "/dlq/replay?limit=10", {
			method: "POST",
			headers: signHeaders(null, "POST", "/dlq/replay?limit=10"),
		});
		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			replayed: 0,
			message: "No entries available for retry",
		});
		expectDocumented(DLQ_API.replayEntries, result);
	});

	it("POST /dlq/replay should reject a limit above 100", async () => {
		await start();
		const result = await request(server, "/dlq/replay?limit=500", {
			method: "POST",
			headers: signHeaders(null, "POST", "/dlq/replay?limit=500"),
		});
		expect(result.status).toBe(400);
		expectDocumented(DLQ_API.replayEntries, result);
		expect(dlqClaimManager.claimEntriesForRetry).not.toHaveBeenCalled();
	});

	it("POST /dlq/replay should reject a signature made for another query", async () => {
		await start();
		const result = await request(server, "/dlq/replay?limit=100", {
			method: "POST",
			headers: signHeaders(null, "POST", "/dlq/replay?limit=10"),
		});
		expect(result.status).toBe(401);
		expect(dlqClaimManager.claimEntriesForRetry).not.toHaveBeenCalled();
	});

	it("GET /dlq should reject an unsigned request", async () => {
		await start();
		const result = await request(server, "/dlq");
		expect(result.status).toBe(403);
		expect(dlqRepository.query).not.toHaveBeenCalled();
	});
});
