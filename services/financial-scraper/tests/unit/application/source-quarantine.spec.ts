import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => ({ warn: jest.fn(), error: jest.fn() }),
}));

import { SourceQuarantine } from "../../../src/application/source-quarantine";

describe("SourceQuarantine with a store", () => {
	it("saves a ban and reopens it in a new process until its deadline", async () => {
		let saved: Record<string, number> = {};
		const store = {
			load: async () => saved,
			save: jest.fn(async (until: Record<string, number>) => {
				saved = until;
			}),
		};
		let now = 1_000;
		const first = new SourceQuarantine(5_000, 1, () => now, store);
		first.fail("binance", 60_000);
		expect(saved).toEqual({ binance: 61_000 });

		const restarted = new SourceQuarantine(5_000, 1, () => now, store);
		await restarted.restore();
		expect(restarted.isOpen("binance")).toBe(true);
		now = 61_001;
		expect(restarted.isOpen("binance")).toBe(false);
	});
});
