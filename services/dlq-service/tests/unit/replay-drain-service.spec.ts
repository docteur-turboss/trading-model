import { describe, expect, it, jest } from "@jest/globals";

let mockActiveReplaysCount = 0;

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/application/services/active-replay-counter", () => ({
	activeReplays: {
		get count() {
			return mockActiveReplaysCount;
		},
	},
}));

describe("ReplayDrainService", () => {
	let ReplayDrainServiceClass: new () => {
		drain: () => Promise<boolean>;
	};

	beforeAll(() => {
		const mod = jest.requireActual(
			"../../src/application/services/replay-drain-service"
		) as {
			ReplayDrainService: typeof ReplayDrainServiceClass;
		};
		ReplayDrainServiceClass = mod.ReplayDrainService;
	});

	beforeEach(() => {
		mockActiveReplaysCount = 0;
	});

	it("is drained when no replay is in flight", async () => {
		await expect(new ReplayDrainServiceClass().drain()).resolves.toBe(true);
	});

	it("is drained once the replays in flight complete", async () => {
		mockActiveReplaysCount = 1;
		setTimeout(() => {
			mockActiveReplaysCount = 0;
		}, 200);

		await expect(new ReplayDrainServiceClass().drain()).resolves.toBe(true);
	});

	it("is not drained while replays are still in flight at the deadline", async () => {
		mockActiveReplaysCount = 2;

		await expect(new ReplayDrainServiceClass().drain()).resolves.toBe(false);
	}, 15000);
});
