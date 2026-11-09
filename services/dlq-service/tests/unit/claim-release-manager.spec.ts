import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_COLLECTION = jest.fn<(...args: any[]) => any>();
const MOCK_UPDATE_MANY = jest.fn<(...args: any[]) => any>();
const MOCK_UPDATE_ONE = jest.fn<(...args: any[]) => any>();
const MOCK_FIND_ONE_AND_UPDATE = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		MONGO_URI: "mongodb://localhost:27017/test",
		MONGO_DB: "test",
		MONGO_COLLECTION: "test",
		INSTANCE_ID: "test-instance",
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		TLS_KEY_PATH: "",
		TLS_CERT_PATH: "",
		TLS_CA_PATH: "",
	},
}));

describe("ClaimReleaseManager", () => {
	let ClaimReleaseManagerClass: new (
		getCollection: never
	) => {
		releaseStaleClaims: (ms?: number) => Promise<number>;
		releaseClaimsByInstance: (id: string) => Promise<number>;
		releaseClaimWithoutCount: (id: string) => Promise<void>;
		incrementRetryCount: (id: string) => Promise<boolean>;
	};

	beforeAll(() => {
		const mod = jest.requireActual(
			"../../src/adapters/outbound/claim-release-manager"
		) as {
			ClaimReleaseManager: typeof ClaimReleaseManagerClass;
		};
		ClaimReleaseManagerClass = mod.ClaimReleaseManager;
	});

	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_GET_COLLECTION.mockResolvedValue({
			updateMany: MOCK_UPDATE_MANY,
			updateOne: MOCK_UPDATE_ONE,
			findOneAndUpdate: MOCK_FIND_ONE_AND_UPDATE,
		});
	});

	it("should release stale claims", async () => {
		MOCK_UPDATE_MANY.mockResolvedValue({ modifiedCount: 5 });
		const manager = new ClaimReleaseManagerClass(MOCK_GET_COLLECTION as never);
		const result = await manager.releaseStaleClaims(30000);
		expect(result).toBe(5);
		expect(MOCK_UPDATE_MANY).toHaveBeenCalledTimes(1);
	});

	it("should release claims by instance", async () => {
		MOCK_UPDATE_MANY.mockResolvedValue({ modifiedCount: 2 });
		const manager = new ClaimReleaseManagerClass(MOCK_GET_COLLECTION as never);
		const result = await manager.releaseClaimsByInstance("instance-1");
		expect(result).toBe(2);
		expect(MOCK_UPDATE_MANY).toHaveBeenCalledTimes(1);
	});

	it("should release claim without count", async () => {
		MOCK_UPDATE_ONE.mockResolvedValue({ modifiedCount: 1 });
		const manager = new ClaimReleaseManagerClass(MOCK_GET_COLLECTION as never);
		await manager.releaseClaimWithoutCount("aaaaaaaaaaaaaaaaaaaaaaaa");
		expect(MOCK_UPDATE_ONE).toHaveBeenCalledTimes(1);
	});

	it("should increment retry count", async () => {
		MOCK_UPDATE_ONE.mockResolvedValue({ modifiedCount: 1 });
		const manager = new ClaimReleaseManagerClass(MOCK_GET_COLLECTION as never);
		const result = await manager.incrementRetryCount(
			"aaaaaaaaaaaaaaaaaaaaaaaa"
		);
		expect(result).toBe(true);
		expect(MOCK_UPDATE_ONE).toHaveBeenCalledTimes(1);
	});
});
