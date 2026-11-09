import { describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_COLLECTION = jest.fn<(...args: any[]) => any>();
const MOCK_FIND = jest.fn<(...args: any[]) => any>();
const MOCK_TO_ARRAY = jest.fn<(...args: any[]) => any>();
const MOCK_BUILD_QUEUABLE_QUERY = jest.fn<(...args: any[]) => any>();
const MOCK_BUILD_ACTIVE_CLAIM_QUERY = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		DLQ_AUTO_RETRY_LIMIT: 50,
	},
}));

jest.mock("../../src/adapters/outbound/dlq-query-builder", () => ({
	DlqQueryBuilder: jest.fn((..._args: any[]) => ({
		buildQueuableQuery: MOCK_BUILD_QUEUABLE_QUERY,
		buildActiveClaimQuery: MOCK_BUILD_ACTIVE_CLAIM_QUERY,
	})),
}));

describe("DlqQueueRepository", () => {
	let DlqQueueRepositoryClass: new (
		getCollection: never
	) => {
		listQueuable: () => Promise<string[]>;
		listActiveClaimIds: () => Promise<string[]>;
	};

	beforeAll(() => {
		const mod = jest.requireActual(
			"../../src/adapters/outbound/dlq-queue-repository"
		) as {
			DlqQueueRepository: typeof DlqQueueRepositoryClass;
		};
		DlqQueueRepositoryClass = mod.DlqQueueRepository;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should list queuable entries", async () => {
		const mockDoc = { _id: { toHexString: () => "id-1" } };
		MOCK_GET_COLLECTION.mockResolvedValue({
			find: MOCK_FIND.mockReturnValue({
				toArray: MOCK_TO_ARRAY.mockResolvedValue([mockDoc]),
			}),
		});
		MOCK_BUILD_QUEUABLE_QUERY.mockReturnValue({ queuable: true });

		const repo = new DlqQueueRepositoryClass(MOCK_GET_COLLECTION as never);
		const result = await repo.listQueuable();

		expect(result).toEqual(["id-1"]);
		expect(MOCK_FIND).toHaveBeenCalledWith(
			{ queuable: true },
			{
				sort: { createdAt: -1 },
				limit: 500,
				projection: { _id: 1 },
			}
		);
	});

	it("should list active claim IDs", async () => {
		const mockDoc = { _id: { toHexString: () => "claim-id-1" } };
		MOCK_GET_COLLECTION.mockResolvedValue({
			find: MOCK_FIND.mockReturnValue({
				toArray: MOCK_TO_ARRAY.mockResolvedValue([mockDoc]),
			}),
		});
		MOCK_BUILD_ACTIVE_CLAIM_QUERY.mockReturnValue({ claimed: true });

		const repo = new DlqQueueRepositoryClass(MOCK_GET_COLLECTION as never);
		const result = await repo.listActiveClaimIds();

		expect(result).toEqual(["claim-id-1"]);
		expect(MOCK_FIND).toHaveBeenCalledWith(
			{ claimed: true },
			{ projection: { _id: 1 } }
		);
	});
});
