import { describe, expect, it, jest } from "@jest/globals";

const MOCK_RELEASE_ALL_ACTIVE = jest.fn();
let mockActiveReplaysCount = 0;

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/application/services/claim-manager", () => ({
	dlqClaimManager: {},
	claimReleaseManager: {
		releaseAllActiveClaims: MOCK_RELEASE_ALL_ACTIVE,
	},
}));

jest.mock("../../src/dlq/shared/active-replay-counter", () => ({
	activeReplays: {
		get count() {
			return mockActiveReplaysCount;
		},
	},
}));

describe("ReplayDrainService", () => {
	let ReplayDrainServiceClass: new () => {
		drain: () => Promise<void>;
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
		jest.clearAllMocks();
		mockActiveReplaysCount = 0;
	});

	it("should return immediately when no active replays", async () => {
		const service = new ReplayDrainServiceClass();
		await service.drain();
		expect(MOCK_RELEASE_ALL_ACTIVE).not.toHaveBeenCalled();
	});

	it("should wait for replays and force release if they don't complete", async () => {
		mockActiveReplaysCount = 2;
		MOCK_RELEASE_ALL_ACTIVE.mockResolvedValue(undefined);

		const service = new ReplayDrainServiceClass();
		await service.drain();

		expect(MOCK_RELEASE_ALL_ACTIVE).toHaveBeenCalledTimes(2);
	}, 15000);
});
