import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { TokenHandler } from "../../src/core/token-handler";
import { TokenManagerService } from "../../src/core/token-manager-service";

describe("TokenManagerService", () => {
	let service: TokenManagerService;
	let mockTokenHandler: jest.Mocked<TokenHandler>;
	const instanceId = "test-instance-1" as never;

	beforeEach(() => {
		jest.clearAllMocks();

		mockTokenHandler = {
			updateToken: jest.fn(),
			generateInstanceToken: jest.fn(),
			validInstanceToken: jest.fn(),
			generateInstanceId: jest.fn(),
			verifyInstanceName: jest.fn(),
		} as unknown as jest.Mocked<TokenHandler>;

		service = new TokenManagerService(mockTokenHandler);
	});

	describe("updateToken", () => {
		it("should delegate to tokenHandler.updateToken", async () => {
			mockTokenHandler.updateToken.mockResolvedValue("new-token");

			const result = await service.updateToken(instanceId);

			expect(mockTokenHandler.updateToken).toHaveBeenCalledWith(instanceId);
			expect(result).toBe("new-token");
		});
	});

	describe("generateInstanceToken", () => {
		it("should delegate to tokenHandler.generateInstanceToken", () => {
			mockTokenHandler.generateInstanceToken.mockReturnValue("token");

			const result = service.generateInstanceToken(instanceId);

			expect(mockTokenHandler.generateInstanceToken).toHaveBeenCalledWith(
				instanceId
			);
			expect(result).toBe("token");
		});
	});

	describe("validInstanceToken", () => {
		it("should delegate to tokenHandler.validInstanceToken", async () => {
			const validation = { token: "test-token", instanceId };
			mockTokenHandler.validInstanceToken.mockResolvedValue(true);

			const result = await service.validInstanceToken(validation);

			expect(mockTokenHandler.validInstanceToken).toHaveBeenCalledWith(
				validation
			);
			expect(result).toBe(true);
		});

		it("should return false when validation fails", async () => {
			mockTokenHandler.validInstanceToken.mockResolvedValue(false);

			const result = await service.validInstanceToken({
				token: "bad",
				instanceId,
			});

			expect(result).toBe(false);
		});
	});

	describe("generateInstanceId", () => {
		it("should delegate to tokenHandler.generateInstanceId", () => {
			const endpoint = { host: "192.168.1.10", port: 8444 };
			mockTokenHandler.generateInstanceId.mockReturnValue("svc-id" as never);

			const result = service.generateInstanceId(endpoint);

			expect(mockTokenHandler.generateInstanceId).toHaveBeenCalledWith(
				endpoint
			);
			expect(result).toBe("svc-id");
		});
	});

	describe("verifyInstanceName", () => {
		it("should delegate to tokenHandler.verifyInstanceName", () => {
			mockTokenHandler.verifyInstanceName.mockReturnValue(true);

			const result = service.verifyInstanceName(
				"financial-scraper-service" as never
			);

			expect(mockTokenHandler.verifyInstanceName).toHaveBeenCalledWith(
				"financial-scraper-service"
			);
			expect(result).toBe(true);
		});

		it("should return false when verification fails", () => {
			mockTokenHandler.verifyInstanceName.mockReturnValue(false);

			const result = service.verifyInstanceName("unknown" as never);

			expect(result).toBe(false);
		});
	});
});
