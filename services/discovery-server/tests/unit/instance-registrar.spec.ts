import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type {
	Protocol,
	ServiceInstance,
} from "@trading-model/contracts/service-registry-types";
import type {
	DurationMs,
	InstanceId,
	IPAddress,
	Port,
	ServiceId,
	UnixTimestamp,
	Version,
} from "@trading-model/primitives/primitives";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	},
}));

const mockSet = jest.fn<(...args: any[]) => any>();
const mockGet = jest.fn<(...args: any[]) => any>();
const mockSadd = jest.fn<(...args: any[]) => any>();
const mockDel = jest.fn<(...args: any[]) => any>();
const mockSrem = jest.fn<(...args: any[]) => any>();
const mockExec = jest.fn<(...args: any[]) => any>();
const mockMulti = jest.fn((..._args: any[]) => ({
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
		serviceName: "financial-scraper" as ServiceId,
		instanceId: "i1" as InstanceId,
		host: "192.168.1.10" as IPAddress,
		port: 8444 as Port,
		version: "1.0.0" as Version,
		ttl: 30_000 as DurationMs,
		protocol: "mtls" as unknown as Protocol,
		registeredAt: (Date.now() - 1000) as UnixTimestamp,
		lastHeartbeat: (Date.now() - 500) as UnixTimestamp,
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
			) as { logger: { warn: jest.Mock<(...args: any[]) => any> } };
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	describe("registerInstance", () => {
		it("should persist instance and return token", async () => {
			mockSet.mockResolvedValue("OK");
			mockGet.mockResolvedValue(null);

			const token = await registrar.registerInstance(makeInstance());

			expect(mockSadd).toHaveBeenCalledWith(
				"test:service:financial-scraper:instances",
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
