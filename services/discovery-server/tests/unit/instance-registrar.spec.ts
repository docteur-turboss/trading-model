import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ServiceInstance } from "@trading-model/validation/domain/contracts/service-registry.types";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const mockSet = jest.fn();
const mockGet = jest.fn();
const mockSadd = jest.fn();
const mockDel = jest.fn();
const mockSrem = jest.fn();
const mockExec = jest.fn();
const mockMulti = jest.fn(() => ({
	sadd: mockSadd,
	set: mockSet,
	del: mockDel,
	srem: mockSrem,
	exec: mockExec,
}));

const MOCK_REDIS = {
	set: mockSet,
	get: mockGet,
	multi: mockMulti,
} as never;

import { InstanceRegistrar } from "../../src/adapters/outbound/instance-registrar";
import type { RedisDeps } from "../../src/shared/redis-deps";

function makeInstance(): ServiceInstance {
	return {
		serviceName: "financial-scraper-service",
		instanceId: "i1",
		host: "192.168.1.10",
		port: 8444,
		version: "1.0.0",
		ttl: 30_000,
		protocol: "mtls",
		registeredAt: Date.now() - 1000,
		lastHeartbeat: Date.now() - 500,
	};
}

describe("InstanceRegistrar", () => {
	let registrar: InstanceRegistrar;
	let deps: RedisDeps;

	beforeEach(() => {
		jest.clearAllMocks();
		deps = {
			redis: MOCK_REDIS,
			keyPrefix: "test:",
			signingSecret: "secret",
		};
		registrar = new InstanceRegistrar(deps);
		mockExec.mockResolvedValue([
			[null, "OK"],
			[null, "OK"],
		]);
	});

	describe("resolveToken", () => {
		it("should generate and persist a new token when SET returns OK", async () => {
			mockSet.mockResolvedValue("OK");

			const token = await registrar.resolveToken("i1" as never);

			expect(token).toContain(Buffer.from("i1", "utf8").toString("base64url"));
			expect(mockSet).toHaveBeenCalledWith(
				"test:instance:i1:token",
				expect.any(String),
				"NX"
			);
		});

		it("should read existing token when SET returns null", async () => {
			mockSet.mockResolvedValue(null);
			mockGet.mockResolvedValue("existing-token");

			const token = await registrar.resolveToken("i1" as never);

			expect(token).toBe("existing-token");
		});
	});

	describe("buildStoredInstance", () => {
		it("should keep existing registeredAt and max lastHeartbeat", async () => {
			mockGet.mockResolvedValue(
				JSON.stringify({
					registeredAt: 1000,
					lastHeartbeat: 2000,
				})
			);

			const instance = makeInstance();
			const result = await registrar.buildStoredInstance(instance, 3000);

			expect(result.registeredAt).toBe(1000);
			expect(result.lastHeartbeat).toBe(3000);
		});

		it("should log warning on corrupt stored metadata", async () => {
			mockGet.mockResolvedValue("{not-json");

			const instance = makeInstance();
			const result = await registrar.buildStoredInstance(instance, 3000);

			expect(result.instanceId).toBe("i1");
			const { logger } = jest.requireMock(
				"@trading-model/http/infrastructure/logger"
			) as { logger: { warn: jest.Mock } };
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe("registerInstance", () => {
		it("should persist instance and return token", async () => {
			mockSet.mockResolvedValue("OK");
			mockGet.mockResolvedValue(null);

			const token = await registrar.registerInstance(makeInstance());

			expect(mockSadd).toHaveBeenCalledWith(
				"test:service:financial-scraper-service:instances",
				"i1"
			);
			expect(mockSet).toHaveBeenCalledWith(
				"test:instance:i1:metadata",
				expect.any(String)
			);
			expect(mockExec).toHaveBeenCalled();
			expect(token).toContain(Buffer.from("i1", "utf8").toString("base64url"));
		});
	});
});
