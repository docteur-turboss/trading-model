import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const mockGet = jest.fn();
const mockSmembers = jest.fn();
const mockMget = jest.fn();
const mockKeys = jest.fn();

const MOCK_REDIS = {
	get: mockGet,
	smembers: mockSmembers,
	mget: mockMget,
	keys: mockKeys,
} as never;

import { InstanceMetadataReader } from "../../src/adapters/outbound/instance-metadata-reader";
import type { RedisDepsWithoutToken } from "../../src/shared/redis-deps";

describe("InstanceMetadataReader", () => {
	let reader: InstanceMetadataReader;
	let deps: RedisDepsWithoutToken;

	beforeEach(() => {
		jest.clearAllMocks();
		deps = { redis: MOCK_REDIS, keyPrefix: "test:" };
		reader = new InstanceMetadataReader(deps);
	});

	describe("getMetadata", () => {
		it("should return undefined when no metadata stored", async () => {
			mockGet.mockResolvedValue(null);
			expect(await reader.getMetadata("i1" as never)).toBeUndefined();
		});

		it("should parse stored JSON metadata", async () => {
			mockGet.mockResolvedValue(
				JSON.stringify({ instanceId: "i1", host: "10.0.0.1" })
			);
			const meta = await reader.getMetadata("i1" as never);
			expect(meta).toEqual({ instanceId: "i1", host: "10.0.0.1" });
		});

		it("should log warning on corrupt metadata", async () => {
			mockGet.mockResolvedValue("{corrupt");
			const meta = await reader.getMetadata("i1" as never);
			expect(meta).toBeUndefined();
			const { logger } = jest.requireMock(
				"@trading-model/http/infrastructure/logger"
			) as { logger: { warn: jest.Mock } };
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe("getServiceInstanceIds", () => {
		it("should return member ids", async () => {
			mockSmembers.mockResolvedValue(["i1", "i2"]);
			const ids = await reader.getServiceInstanceIds(
				"financial-scraper-service" as never
			);
			expect(mockSmembers).toHaveBeenCalledWith(
				"test:service:financial-scraper-service:instances"
			);
			expect(ids).toEqual(["i1", "i2"]);
		});
	});

	describe("getMetadatas", () => {
		it("should parse all non-null entries and skip corrupt ones", async () => {
			mockMget.mockResolvedValue([
				JSON.stringify({ instanceId: "i1" }),
				null,
				"{corrupt",
			]);
			const result = await reader.getMetadatas(["k1", "k2", "k3"]);
			expect(result).toEqual([{ instanceId: "i1" }]);
			const { logger } = jest.requireMock(
				"@trading-model/http/infrastructure/logger"
			) as { logger: { warn: jest.Mock } };
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe("listServiceNames", () => {
		it("should parse service names from keys", async () => {
			mockKeys.mockResolvedValue([
				"test:service:financial-scraper-service:instances",
				"test:service:unrelated-key",
			]);
			const names = await reader.listServiceNames();
			expect(names).toEqual(["financial-scraper-service"]);
		});
	});
});
