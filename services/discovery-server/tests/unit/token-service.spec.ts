import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockGenerateToken = jest.fn();
const mockValidateToken = jest.fn();
const mockVerifyName = jest.fn();

jest.mock("@trading-model/common/crypto/token-service", () => ({
	generateInstanceToken: (...args: unknown[]) => mockGenerateToken(...args),
	validInstanceToken: (...args: unknown[]) => mockValidateToken(...args),
	verifyInstanceName: (...args: unknown[]) => mockVerifyName(...args),
}));

import type { TokenValidationInput } from "@trading-model/common/crypto/token-service";
import { TokenService } from "../../src/core/token-service";

describe("TokenService", () => {
	let service: TokenService;
	const signingSecret = "test-secret-123";
	const instanceId = "test-instance-1";

	beforeEach(() => {
		jest.clearAllMocks();
		service = new TokenService(signingSecret);
	});

	describe("constructor", () => {
		it("should create an instance with the given signing secret", () => {
			expect(service).toBeInstanceOf(TokenService);
		});
	});

	describe("generateInstanceToken", () => {
		it("should call common generateInstanceToken with instanceId and signingSecret", () => {
			mockGenerateToken.mockReturnValue("generated-token");
			const result = service.generateInstanceToken(instanceId);
			expect(mockGenerateToken).toHaveBeenCalledWith(instanceId, signingSecret);
			expect(result).toBe("generated-token");
		});
	});

	describe("validInstanceToken", () => {
		it("should call common validInstanceToken with merged input including signingSecret", () => {
			mockValidateToken.mockReturnValue(true);
			const input: TokenValidationInput = {
				token: "some-token",
				instanceId: instanceId,
				signingSecret: "",
				storedToken: "stored-token",
			};
			const result = service.validInstanceToken(input);
			expect(mockValidateToken).toHaveBeenCalledWith({
				...input,
				signingSecret,
			});
			expect(result).toBe(true);
		});

		it("should warn when token validation fails", () => {
			const { logger } = jest.requireMock(
				"@trading-model/common/config/logger"
			) as { logger: { warn: jest.Mock } };
			mockValidateToken.mockReturnValue(false);
			const input: TokenValidationInput = {
				token: "bad-token",
				instanceId: instanceId,
				signingSecret: "",
			};
			const result = service.validInstanceToken(input);
			expect(result).toBe(false);
			expect(logger.warn).toHaveBeenCalledWith(
				"Token validation failed",
				expect.objectContaining({ instanceId })
			);
		});
	});

	describe("verifyInstanceName", () => {
		it("should call common verifyInstanceName", () => {
			mockVerifyName.mockReturnValue(true);
			const result = service.verifyInstanceName(
				"financial-scraper-service" as never
			);
			expect(mockVerifyName).toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it("should return false when name is invalid", () => {
			mockVerifyName.mockReturnValue(false);
			const result = service.verifyInstanceName("unknown" as never);
			expect(result).toBe(false);
		});
	});

	describe("static generateInstanceToken", () => {
		it("should call common generateInstanceToken with explicit secret", () => {
			mockGenerateToken.mockReturnValue("static-token");
			const result = TokenService.generateInstanceToken(
				instanceId,
				"explicit-secret"
			);
			expect(mockGenerateToken).toHaveBeenCalledWith(
				instanceId,
				"explicit-secret"
			);
			expect(result).toBe("static-token");
		});
	});

	describe("static validInstanceToken", () => {
		it("should call common validInstanceToken with provided input", () => {
			mockValidateToken.mockReturnValue(true);
			const input: TokenValidationInput = {
				token: "tok",
				instanceId: instanceId,
				signingSecret: "sec",
			};
			const result = TokenService.validInstanceToken(input);
			expect(mockValidateToken).toHaveBeenCalledWith(input);
			expect(result).toBe(true);
		});
	});

	describe("static verifyInstanceName", () => {
		it("should call common verifyInstanceName", () => {
			mockVerifyName.mockReturnValue(true);
			const result = TokenService.verifyInstanceName(
				"discovery-service" as never
			);
			expect(mockVerifyName).toHaveBeenCalled();
			expect(result).toBe(true);
		});
	});
});
