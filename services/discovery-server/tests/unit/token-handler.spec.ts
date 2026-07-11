import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const mockGenerateInstanceId = jest.fn();

jest.mock("@trading-model/common/crypto/token-service", () => ({
	generateInstanceId: (...args: unknown[]) => mockGenerateInstanceId(...args),
}));

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn(),
	Redis: jest.fn(),
}));

import { TokenHandler } from "../../src/core/token-handler";
import type { TokenService } from "../../src/core/token-service";

describe("TokenHandler", () => {
	let handler: TokenHandler;
	let tokenService: jest.Mocked<TokenService>;
	let mockRedis: { get: jest.Mock; set: jest.Mock };
	const mockKeyBuilder = {
		instanceToken: jest.fn().mockReturnValue("instance:test-instance-1:token"),
	};
	const instanceId = "test-instance-1" as never;

	beforeEach(() => {
		jest.clearAllMocks();

		mockRedis = { get: jest.fn(), set: jest.fn() };
		tokenService = {
			generateInstanceToken: jest.fn(),
			validInstanceToken: jest.fn(),
			verifyInstanceName: jest.fn(),
		} as unknown as jest.Mocked<TokenService>;

		handler = new TokenHandler(
			mockRedis as never,
			mockKeyBuilder as never,
			tokenService
		);
	});

	describe("generateInstanceToken", () => {
		it("should delegate to tokenService.generateInstanceToken", () => {
			tokenService.generateInstanceToken.mockReturnValue("token");

			const result = handler.generateInstanceToken(instanceId);

			expect(tokenService.generateInstanceToken).toHaveBeenCalledWith(
				instanceId
			);
			expect(result).toBe("token");
		});
	});

	describe("updateToken", () => {
		it("should generate a new token and persist it in Redis", async () => {
			tokenService.generateInstanceToken.mockReturnValue("new-token");
			mockRedis.set.mockResolvedValue("OK");

			const result = await handler.updateToken(instanceId);

			expect(tokenService.generateInstanceToken).toHaveBeenCalledWith(
				instanceId
			);
			expect(mockRedis.set).toHaveBeenCalledWith(
				"instance:test-instance-1:token",
				"new-token"
			);
			expect(result).toBe("new-token");
		});
	});

	describe("validInstanceToken", () => {
		it("should return true when stored token validation passes", async () => {
			mockRedis.get.mockResolvedValue("stored-token");
			tokenService.validInstanceToken.mockReturnValue(true);

			const result = await handler.validInstanceToken({
				token: "stored-token",
				instanceId,
			});

			expect(result).toBe(true);
			expect(mockRedis.get).toHaveBeenCalledWith(
				"instance:test-instance-1:token"
			);
			expect(tokenService.validInstanceToken).toHaveBeenCalledWith(
				expect.objectContaining({
					token: "stored-token",
					signingSecret: "",
					storedToken: "stored-token",
				})
			);
		});

		it("should return false when stored token validation fails", async () => {
			mockRedis.get.mockResolvedValue("stored-token");
			tokenService.validInstanceToken.mockReturnValue(false);

			const result = await handler.validInstanceToken({
				token: "wrong-token",
				instanceId,
			});

			expect(result).toBe(false);
		});
	});

	describe("generateInstanceId", () => {
		it("should return a serviceId from the endpoint", () => {
			mockGenerateInstanceId.mockReturnValue("generated-id");
			const result = handler.generateInstanceId({
				host: "192.168.1.10",
				port: 8444,
			});
			expect(result).toBeDefined();
			expect(typeof result).toBe("string");
		});
	});

	describe("verifyInstanceName", () => {
		it("should delegate to tokenService.verifyInstanceName", () => {
			tokenService.verifyInstanceName.mockReturnValue(true);

			const result = handler.verifyInstanceName(
				"financial-scraper-service" as never
			);

			expect(result).toBe(true);
			expect(tokenService.verifyInstanceName).toHaveBeenCalledWith(
				"financial-scraper-service"
			);
		});

		it("should return false when name is not recognized", () => {
			tokenService.verifyInstanceName.mockReturnValue(false);

			const result = handler.verifyInstanceName("unknown" as never);

			expect(result).toBe(false);
		});
	});
});
