import { describe, expect, it, jest } from "@jest/globals";
import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import {
	createDlqHandlers,
	type DlqHandlerDeps,
	type DlqUseCases,
} from "../../src/adapters/inbound/dlq-service";

type Body = Record<string, unknown>;

function setup(
	overrides: {
		useCases?: Partial<DlqUseCases>;
		connected?: boolean;
		missingIndexes?: string[];
		redisUp?: boolean;
		query?: DlqHandlerDeps["entries"]["query"];
	} = {}
) {
	const deps: DlqHandlerDeps = {
		useCases: {
			addEntry: async () => ({ status: "added", id: "entry-1" }),
			deleteEntries: async (ids) => ({ deleted: ids.length }),
			replayEntries: async () => ({ status: "no-entries" }),
			...overrides.useCases,
		},
		entries: {
			count: async () => 5,
			query: overrides.query ?? (async () => []),
		},
		db: {
			isConnected: () => overrides.connected ?? true,
			getMissingCriticalIndexes: () => overrides.missingIndexes ?? [],
		},
		queue: { isAvailable: () => overrides.redisUp ?? true },
	};
	return createDlqHandlers(deps);
}

const ENTRY = { topic: "t", message: {} } as never as DlqEntry;

async function call<T>(p: Promise<{ data?: unknown; status?: number }>) {
	const r = await p;
	return { status: r.status, body: r.data as T };
}

describe("DLQ HTTP handlers", () => {
	describe("addEntry", () => {
		it.each([
			[{ status: "added", id: "entry-1" }, 201, { id: "entry-1" }],
			[
				{ status: "rejected", reason: "too-large" },
				400,
				{ error: "Message payload exceeds maximum size of 5MB" },
			],
			[
				{ status: "rejected", reason: "storage-unavailable" },
				503,
				{ code: "STORAGE_UNAVAILABLE" },
			],
			[
				{ status: "capacity-reached" },
				429,
				{ error: "DLQ capacity limit reached, entry rejected" },
			],
			[{ status: "storage-error" }, 503, { code: "STORAGE_UNAVAILABLE" }],
		] as const)("maps %j to %i", async (result, status, body) => {
			const h = setup({ useCases: { addEntry: async () => result } });
			const r = await call<Body>(h.addEntry(ENTRY) as never);
			expect(r.status).toBe(status);
			expect(r.body).toMatchObject(body);
		});
	});

	describe("deleteEntries", () => {
		it("returns the deleted count with 200", async () => {
			const r = await call<Body>(
				setup().deleteEntries({ ids: ["a", "b"] }) as never
			);
			expect(r).toEqual({ status: 200, body: { deleted: 2 } });
		});
	});

	describe("replayEntries", () => {
		it.each([
			[{ status: "message-manager-unresolved" }, 500],
			[{ status: "no-entries" }, 200],
			[{ status: "replayed", details: { batchId: "b", replayed: 1 } }, 200],
		] as const)("maps %j to %i", async (result, status) => {
			const h = setup({ useCases: { replayEntries: async () => result } });
			const r = await call<Body>(
				h.replayEntries({ limit: 10 } as never) as never
			);
			expect(r.status).toBe(status);
		});

		it("passes the span to the use case and rethrows its failure", async () => {
			const replayEntries = jest.fn<DlqUseCases["replayEntries"]>(async () => {
				throw new Error("boom");
			});
			const h = setup({ useCases: { replayEntries } });

			await expect(h.replayEntries({ limit: 10 } as never)).rejects.toThrow(
				"boom"
			);
			expect(replayEntries).toHaveBeenCalledWith(
				{ limit: 10 },
				expect.anything()
			);
		});
	});

	describe("listEntries", () => {
		it("returns offset pagination", async () => {
			const h = setup({ query: async () => [{ id: "1" }] as never });
			const r = await call<Body>(
				h.listEntries({ limit: 10, offset: 0 } as never) as never
			);
			expect(r.status).toBe(200);
			expect(r.body).toMatchObject({ count: 1, hasMore: false, offset: 0 });
		});

		it("returns the cursor of the last entry when more remain", async () => {
			const h = setup({
				query: async () => [{ id: "5" }, { id: "4" }] as never,
			});
			const r = await call<Body>(
				h.listEntries({ limit: 2, offset: 0, cursor: "abc" } as never) as never
			);
			expect(r.body).toMatchObject({ cursor: "4", hasMore: true });
			expect(r.body).not.toHaveProperty("offset");
		});
	});

	describe("health", () => {
		it("reports the entry count", async () => {
			const r = await call<Body>(setup().healthCheck() as never);
			expect(r).toEqual({ status: 200, body: { status: "ok", entries: 5 } });
		});

		it("is ready with db and redis up", async () => {
			const r = await call<Body>(setup().readyCheck() as never);
			expect(r.status).toBe(200);
			expect(r.body).toMatchObject({ status: "ready", redis: "connected" });
		});

		it("is degraded without redis", async () => {
			const r = await call<Body>(
				setup({ redisUp: false }).readyCheck() as never
			);
			expect(r.body).toMatchObject({
				status: "degraded",
				redis: "unavailable",
			});
		});

		it("is not ready without database", async () => {
			const r = await call<Body>(
				setup({ connected: false }).readyCheck() as never
			);
			expect(r.status).toBe(503);
		});

		it("is degraded with missing indexes", async () => {
			const r = await call<Body>(
				setup({ missingIndexes: ["a", "b"] }).readyCheck() as never
			);
			expect(r.status).toBe(503);
			expect(r.body).toMatchObject({
				reason: "Missing critical indexes: a, b",
			});
		});
	});
});
