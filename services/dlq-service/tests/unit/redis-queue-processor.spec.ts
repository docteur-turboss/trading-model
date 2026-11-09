import { describe, expect, it, jest } from "@jest/globals";
import type { URLString } from "@trading-model/primitives/primitives";
import { createRedisQueueProcessor } from "../../src/application/use-cases/redis-queue-processor";

function setup(
	opts: { skip?: boolean; url?: URLString | null; ids?: string[] } = {}
) {
	const resolve = jest.fn<() => Promise<URLString | null>>(async () =>
		opts.url === undefined ? ("https://mm:3000" as URLString) : opts.url
	);
	const releaseStaleClaims = jest.fn<() => Promise<number>>(async () => 0);
	const claimAndReplay = jest.fn<
		(ids: string[], url: URLString) => Promise<void>
	>(async () => undefined);
	const process = createRedisQueueProcessor({
		queue: {
			shouldSkip: () => opts.skip ?? false,
			popEntries: async () => opts.ids ?? [],
		},
		messageManager: { resolve },
		claimRelease: { releaseStaleClaims },
		orchestrator: { claimAndReplay },
	});
	return { process, resolve, releaseStaleClaims, claimAndReplay };
}

describe("redis-queue-processor", () => {
	it("does nothing when the queue says to skip", async () => {
		const t = setup({ skip: true });
		await t.process();
		expect(t.resolve).not.toHaveBeenCalled();
	});

	it("does nothing when the message-manager URL is unknown", async () => {
		const t = setup({ url: null });
		await t.process();
		expect(t.releaseStaleClaims).not.toHaveBeenCalled();
	});

	it("releases stale claims then stops on an empty queue", async () => {
		const t = setup({ ids: [] });
		await t.process();
		expect(t.releaseStaleClaims).toHaveBeenCalled();
		expect(t.claimAndReplay).not.toHaveBeenCalled();
	});

	it("hands the popped ids to the orchestrator", async () => {
		const t = setup({ ids: ["a", "b"] });
		await t.process();
		expect(t.claimAndReplay).toHaveBeenCalledWith(
			["a", "b"],
			expect.anything()
		);
	});
});
