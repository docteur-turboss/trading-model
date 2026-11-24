import http from "node:http";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { buildSignedHeaders } from "@trading-model/crypto/request-signer";
import {
	type ApiRoute,
	responseIssues,
} from "@trading-model/http/api-route/api-route";
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
		fn.resetKey = jest.fn<(...args: any[]) => any>();
		return fn;
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
}));

jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/config/audit", () => ({
	publishDlqEvent: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/config/redis-queue", () => ({
	dlqRedisQueue: {
		push: jest.fn<(...args: any[]) => any>().mockResolvedValue(true),
		isAvailable: () => true,
	},
}));

jest.mock("../../src/config/metrics", () => ({
	metricsHandler: jest.fn<(...args: any[]) => any>(),
	metrics: {
		entriesDeleted: { inc: jest.fn<(...args: any[]) => any>() },
		entriesReplayed: { inc: jest.fn<(...args: any[]) => any>() },
		entriesReplayFailed: { inc: jest.fn<(...args: any[]) => any>() },
		entriesPruned: { inc: jest.fn<(...args: any[]) => any>() },
		pruneErrors: { inc: jest.fn<(...args: any[]) => any>() },
		collectionSize: { set: jest.fn<(...args: any[]) => any>() },
	},
}));

jest.mock("../../src/config/address-manager", () => ({
	FIND_A_SERVICE: jest.fn<(...args: any[]) => any>(),
	AddressManager: { start: jest.fn<(...args: any[]) => any>() },
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
import { createDlqHandlers } from "../../src/adapters/inbound/dlq-service";
import { DlqRoutes } from "../../src/adapters/inbound/routes";
import { createDeleteEntries } from "../../src/application/use-cases/dlq-delete-handler";
import { createReplayEntries } from "../../src/application/use-cases/dlq-replay-service";

const dlqRepository = {
	insert: jest.fn<(...args: any[]) => any>(),
	query: jest.fn<(...args: any[]) => any>(),
	delete: jest.fn<(...args: any[]) => any>(),
	count: jest.fn<(...args: any[]) => any>(),
};
const dlqClaimManager = {
	claimEntriesForRetry: jest.fn<(...args: any[]) => any>(),
};
const metricsPort = {
	entriesDeleted: () => undefined,
	batchReplayed: () => undefined,
};
const auditPort = {
	notifyDelete: jest.fn<(...args: any[]) => Promise<boolean>>(async () => true),
	notifyReplay: async () => true,
};
const handlers = createDlqHandlers({
	entries: dlqRepository,
	useCases: {
		deleteEntries: createDeleteEntries({
			entries: dlqRepository,
			metrics: metricsPort,
			audit: auditPort,
		}),
		replayEntries: createReplayEntries({
			messageManager: {
				resolve: async () => "https://message-manager:3000" as never,
			},
			claimRelease: { releaseStaleClaims: async () => 0 },
			claims: dlqClaimManager,
			retryLedger: { abandonExhaustedEntries: async () => 0 },
			replayBatch: async () => ({ success: 0, errors: [] }),
			audit: auditPort,
			metrics: metricsPort,
			settings: { instanceId: "dlq-service-test-1" as never },
		}),
	},
});

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
	// Stands in for the mTLS middleware: the peer SVID matches the claimed caller.
	app.use((req, _res, next) => {
		const name =
			req.headers["x-service-name"] === "admin"
				? "api-gateway"
				: req.headers["x-service-name"];
		(req as never as { clientIdentity: string }).clientIdentity =
			`spiffe://trading-model.local/ns/trading-model/sa/${name}`;
		next();
	});
	app.use("/", DlqRoutes(handlers));
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
		(
			dlqRepository.insert as jest.Mock<(...args: any[]) => any>
		).mockResolvedValue("entry-1");
		(
			dlqRepository.query as jest.Mock<(...args: any[]) => any>
		).mockResolvedValue([]);
		(
			dlqRepository.count as jest.Mock<(...args: any[]) => any>
		).mockResolvedValue(5);
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

	it("POST /dlq is gone: dead letters live in the dead streams (ADR-0073)", async () => {
		await start();
		const result = await request(server, "/v1/dlq", {
			method: "POST",
			body: validEntry,
			headers: signHeaders(validEntry, "POST", "/v1/dlq"),
		});
		expect(result.status).toBe(404);
		expect(dlqRepository.insert).not.toHaveBeenCalled();
	});

	it("GET /dlq should list entries for an allowed service", async () => {
		(
			dlqRepository.query as jest.Mock<(...args: any[]) => any>
		).mockResolvedValue([
			{
				id: "entry-1",
				topic: "test.topic",
				message: { key: "value" },
				service: "audit-logger-service",
				reason: "integration test",
				deliveryAttempt: 1,
				createdAt: new Date().toISOString(),
			},
		]);
		await start();
		const result = await request(server, "/v1/dlq", {
			headers: signHeaders(null, "GET", "/v1/dlq"),
		});
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({ count: 1, hasMore: false });
		expect((result.body as { entries: unknown[] }).entries).toHaveLength(1);
		expectDocumented(DLQ_API.listEntries, result);
	});

	it("GET /dlq should reject an invalid query with 400", async () => {
		await start();
		const result = await request(server, "/v1/dlq?limit=abc", {
			headers: signHeaders(null, "GET", "/v1/dlq?limit=abc"),
		});
		expect(result.status).toBe(400);
		expectDocumented(DLQ_API.listEntries, result);
		expect(dlqRepository.query).not.toHaveBeenCalled();
	});

	it("DELETE /dlq should delete the given ids", async () => {
		(
			dlqRepository.delete as jest.Mock<(...args: any[]) => any>
		).mockResolvedValue(2);
		await start();
		const body = { ids: ["a", "b"] };
		const result = await request(server, "/v1/dlq", {
			method: "DELETE",
			body,
			headers: signHeaders(body, "DELETE", "/v1/dlq"),
		});
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ deleted: 2, auditRecorded: true });
		expectDocumented(DLQ_API.deleteEntries, result);
	});

	it("DELETE /dlq answers 502 when message-manager refused the audit event, and ignores x-actor from a caller that is not api-gateway", async () => {
		(
			dlqRepository.delete as jest.Mock<(...args: any[]) => any>
		).mockResolvedValue(1);
		auditPort.notifyDelete.mockResolvedValueOnce(false);
		await start();
		const body = { ids: ["a"] };
		const result = await request(server, "/v1/dlq", {
			method: "DELETE",
			body,
			headers: {
				...signHeaders(body, "DELETE", "/v1/dlq"),
				"x-actor": "forged",
			},
		});
		expect(result.status).toBe(502);
		expect(result.body).toEqual({ deleted: 1, auditRecorded: false });
		expectDocumented(DLQ_API.deleteEntries, result);
		expect(auditPort.notifyDelete).toHaveBeenLastCalledWith(["a"], 1, null);
	});

	it("DELETE /dlq should reject an empty id list with 400", async () => {
		await start();
		const body = { ids: [] };
		const result = await request(server, "/v1/dlq", {
			method: "DELETE",
			body,
			headers: signHeaders(body, "DELETE", "/v1/dlq"),
		});
		expect(result.status).toBe(400);
		expectDocumented(DLQ_API.deleteEntries, result);
		expect(dlqRepository.delete).not.toHaveBeenCalled();
	});

	it("POST /dlq/replay should answer when nothing is waiting", async () => {
		(
			dlqClaimManager.claimEntriesForRetry as jest.Mock<(...args: any[]) => any>
		).mockResolvedValue([]);
		await start();
		const result = await request(server, "/v1/dlq/replay?limit=10", {
			method: "POST",
			headers: signHeaders(null, "POST", "/v1/dlq/replay?limit=10"),
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
		const result = await request(server, "/v1/dlq/replay?limit=500", {
			method: "POST",
			headers: signHeaders(null, "POST", "/v1/dlq/replay?limit=500"),
		});
		expect(result.status).toBe(400);
		expectDocumented(DLQ_API.replayEntries, result);
		expect(dlqClaimManager.claimEntriesForRetry).not.toHaveBeenCalled();
	});

	it("POST /dlq/replay should reject a signature made for another query", async () => {
		await start();
		const result = await request(server, "/v1/dlq/replay?limit=100", {
			method: "POST",
			headers: signHeaders(null, "POST", "/v1/dlq/replay?limit=10"),
		});
		expect(result.status).toBe(401);
		expect(dlqClaimManager.claimEntriesForRetry).not.toHaveBeenCalled();
	});

	it("GET /dlq should reject an unsigned request", async () => {
		await start();
		const result = await request(server, "/v1/dlq");
		expect(result.status).toBe(403);
		expect(dlqRepository.query).not.toHaveBeenCalled();
	});
});
