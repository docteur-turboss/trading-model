import { describe, expect, it, jest } from "@jest/globals";
import {
	createDlqHandlers,
	type DlqHandlerDeps,
	type DlqUseCases,
} from "../../src/adapters/inbound/dlq-service";

type Body = Record<string, unknown>;

function setup(
	overrides: {
		useCases?: Partial<DlqUseCases>;
		query?: DlqHandlerDeps["entries"]["query"];
	} = {}
) {
	const deps: DlqHandlerDeps = {
		useCases: {
			deleteEntries: async (ids) => ({
				deleted: ids.length,
				auditRecorded: true,
			}),
			replayEntries: async () => ({ status: "no-entries" }),
			...overrides.useCases,
		},
		entries: {
			count: async () => 5,
			query: overrides.query ?? (async () => []),
		},
	};
	return createDlqHandlers(deps);
}

async function call<T>(p: Promise<{ data?: unknown; status?: number }>) {
	const r = await p;
	return { status: r.status, body: r.data as T };
}

describe("DLQ HTTP handlers", () => {
	describe("deleteEntries", () => {
		it("returns the deleted count with 200", async () => {
			const r = await call<Body>(
				setup().deleteEntries({ ids: ["a", "b"] }, "ops-alice") as never
			);
			expect(r).toEqual({
				status: 200,
				body: { deleted: 2, auditRecorded: true },
			});
		});

		it("answers 502 when the audit event was refused, with the deleted count", async () => {
			const deleteEntries = jest.fn<DlqUseCases["deleteEntries"]>(async () => ({
				deleted: 1,
				auditRecorded: false,
			}));
			const r = await call<Body>(
				setup({ useCases: { deleteEntries } }).deleteEntries(
					{ ids: ["a"] },
					"ops-alice"
				) as never
			);
			expect(deleteEntries).toHaveBeenCalledWith(["a"], "ops-alice");
			expect(r).toEqual({
				status: 502,
				body: { deleted: 1, auditRecorded: false },
			});
		});
	});

	describe("replayEntries", () => {
		it.each([
			[{ status: "message-manager-unresolved" }, 500],
			[{ status: "no-entries" }, 200],
			[
				{
					status: "replayed",
					details: { batchId: "b", replayed: 1 },
					auditRecorded: true,
				},
				200,
			],
			[
				{
					status: "replayed",
					details: { batchId: "b", replayed: 1 },
					auditRecorded: false,
				},
				502,
			],
		] as const)("maps %j to %i", async (result, status) => {
			const h = setup({ useCases: { replayEntries: async () => result } });
			const r = await call<Body>(
				h.replayEntries({ limit: 10 } as never, null) as never
			);
			expect(r.status).toBe(status);
		});

		it("passes the span to the use case and rethrows its failure", async () => {
			const replayEntries = jest.fn<DlqUseCases["replayEntries"]>(async () => {
				throw new Error("boom");
			});
			const h = setup({ useCases: { replayEntries } });

			await expect(
				h.replayEntries({ limit: 10 } as never, "ops-alice")
			).rejects.toThrow("boom");
			expect(replayEntries).toHaveBeenCalledWith(
				{ limit: 10, actor: "ops-alice" },
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
	});
});
