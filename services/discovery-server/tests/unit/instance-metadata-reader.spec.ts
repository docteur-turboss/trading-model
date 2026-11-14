import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	},
}));

const mockGet = jest.fn<(...args: any[]) => any>();
const mockSmembers = jest.fn<(...args: any[]) => any>();
const mockMget = jest.fn<(...args: any[]) => any>();
const mockScard = jest.fn<(key: string) => Promise<number>>();

const MOCK_REDIS = {
	get: mockGet,
	smembers: mockSmembers,
	mget: mockMget,
	scard: mockScard,
} as never;

import { ALL_SERVICE_NAMES } from "@trading-model/primitives/service-instance-name";
import { InstanceMetadataReader } from "../../src/adapters/outbound/instance-metadata-reader";
import type { RedisDeps } from "../../src/shared/redis-deps";

describe("InstanceMetadataReader", () => {
	let reader: InstanceMetadataReader;
	let deps: RedisDeps;

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
			) as { logger: { warn: jest.Mock<(...args: any[]) => any> } };
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe("getServiceInstanceIds", () => {
		it("should return member ids", async () => {
			mockSmembers.mockResolvedValue(["i1", "i2"]);
			const ids = await reader.getServiceInstanceIds(
				"financial-scraper" as never
			);
			expect(mockSmembers).toHaveBeenCalledWith(
				"test:service:financial-scraper:instances"
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
			) as { logger: { warn: jest.Mock<(...args: any[]) => any> } };
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe("listServiceNames", () => {
		it("should list the known services that have registered instances", async () => {
			mockScard.mockImplementation(async (key) =>
				key === "test:service:financial-scraper:instances" ? 2 : 0
			);
			const names = await reader.listServiceNames();
			expect(names).toEqual(["financial-scraper"]);
		});

		it("should read one set per known service instead of scanning keys", async () => {
			mockScard.mockResolvedValue(0);
			await expect(reader.listServiceNames()).resolves.toEqual([]);
			expect(mockScard).toHaveBeenCalledTimes(ALL_SERVICE_NAMES.size);
		});
	});
});
