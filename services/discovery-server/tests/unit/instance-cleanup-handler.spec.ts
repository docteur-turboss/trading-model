import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSrem = jest.fn();
const mockDel = jest.fn();
const mockExec = jest.fn();
const mockMulti = jest.fn(() => ({
	srem: mockSrem,
	del: mockDel,
	exec: mockExec,
}));

const MOCK_REDIS = {
	multi: mockMulti,
} as never;

import { removeInstanceSetAndMetadata } from "../../src/adapters/outbound/instance-cleanup-handler";
import type { RedisDepsWithoutToken } from "../../src/shared/redis-deps";

describe("removeInstanceSetAndMetadata", () => {
	const deps: RedisDepsWithoutToken = {
		redis: MOCK_REDIS,
		keyPrefix: "test:",
	};
	const identity = {
		serviceName: "financial-scraper-service" as never,
		instanceId: "i1" as never,
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return true when member removed", async () => {
		mockExec.mockResolvedValue([[null, 1]]);

		const result = await removeInstanceSetAndMetadata(deps, identity);

		expect(mockSrem).toHaveBeenCalledWith(
			"test:service:financial-scraper-service:instances",
			"i1"
		);
		expect(mockDel).toHaveBeenCalledWith("test:instance:i1:metadata");
		expect(mockDel).toHaveBeenCalledWith("test:instance:i1:token");
		expect(mockDel).toHaveBeenCalledWith("test:instance:i1:updatedBy");
		expect(result).toBe(true);
	});

	it("should return false when exec returns null", async () => {
		mockExec.mockResolvedValue(null);

		const result = await removeInstanceSetAndMetadata(deps, identity);

		expect(result).toBe(false);
	});

	it("should return false when member not removed", async () => {
		mockExec.mockResolvedValue([[null, 0]]);

		const result = await removeInstanceSetAndMetadata(deps, identity);

		expect(result).toBe(false);
	});
});
