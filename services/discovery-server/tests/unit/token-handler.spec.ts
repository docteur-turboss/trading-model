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

jest.mock("@trading-model/crypto/crypto/token-service", () => ({
	generateInstanceId: (...args: unknown[]) => mockGenerateInstanceId(...args),
}));

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn(),
	Redis: jest.fn(),
}));

jest.mock("@trading-model/crypto/crypto/token-service", () => {
	const actual = jest.requireActual(
		"@trading-model/crypto/crypto/token-service"
	);
	return {
		...actual,
		generateInstanceToken: jest.fn(),
		validInstanceToken: jest.fn(),
	};
});

import { TokenHandler } from "../../src/core/token-handler";

describe("TokenHandler", () => {
	let handler: TokenHandler;
	let mockRedis: { get: jest.Mock; set: jest.Mock };
	const mockKeyBuilder = {
		instanceToken: jest.fn().mockReturnValue("instance:test-instance-1:token"),
	};
	const instanceId = "test-instance-1" as never;
	const signingSecret = "test-secret";

	beforeEach(() => {
		jest.clearAllMocks();

		mockRedis = { get: jest.fn(), set: jest.fn() };

		handler = new TokenHandler(
			mockRedis as never,
			mockKeyBuilder as never,
			signingSecret
		);
	});

	describe("generateInstanceToken", () => {
		it("should generate a token for the instance", () => {
			const { generateInstanceToken: mockGenerate } = jest.requireMock(
				"@trading-model/crypto/crypto/token-service"
			) as { generateInstanceToken: jest.Mock };
			mockGenerate.mockReturnValue("token");

			const result = handler.generateInstanceToken(instanceId);

			expect(mockGenerate).toHaveBeenCalledWith(instanceId, signingSecret);
			expect(result).toBe("token");
		});
	});

	describe("updateToken", () => {
		it("should generate a new token and persist it in Redis", async () => {
			const { generateInstanceToken: mockGenerate } = jest.requireMock(
				"@trading-model/crypto/crypto/token-service"
			) as { generateInstanceToken: jest.Mock };
			mockGenerate.mockReturnValue("new-token");
			mockRedis.set.mockResolvedValue("OK");

			const result = await handler.updateToken(instanceId);

			expect(mockGenerate).toHaveBeenCalledWith(instanceId, signingSecret);
			expect(mockRedis.set).toHaveBeenCalledWith(
				"instance:test-instance-1:token",
				"new-token"
			);
			expect(result).toBe("new-token");
		});
	});

	describe("validInstanceToken", () => {
		it("should return true when stored token validation passes", async () => {
			const { validInstanceToken: mockValidate } = jest.requireMock(
				"@trading-model/crypto/crypto/token-service"
			) as { validInstanceToken: jest.Mock };
			mockRedis.get.mockResolvedValue("stored-token");
			mockValidate.mockReturnValue(true);

			const result = await handler.validInstanceToken({
				token: "stored-token",
				instanceId,
			});

			expect(result).toBe(true);
			expect(mockRedis.get).toHaveBeenCalledWith(
				"instance:test-instance-1:token"
			);
			expect(mockValidate).toHaveBeenCalledWith(
				expect.objectContaining({
					token: "stored-token",
					signingSecret,
					storedToken: "stored-token",
				})
			);
		});

		it("should return false when stored token validation fails", async () => {
			const { validInstanceToken: mockValidate } = jest.requireMock(
				"@trading-model/crypto/crypto/token-service"
			) as { validInstanceToken: jest.Mock };
			mockRedis.get.mockResolvedValue("stored-token");
			mockValidate.mockReturnValue(false);

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
		it("should return true when name is valid", () => {
			const result = handler.verifyInstanceName(
				"financial-scraper-service" as never
			);

			expect(result).toBe(true);
		});

		it("should return false when name is not recognized", () => {
			const result = handler.verifyInstanceName("unknown" as never);

			expect(result).toBe(false);
		});
	});
});
