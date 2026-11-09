import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

describe("logger", () => {
	it("should re-export logger from common", () => {
		const { logger } = jest.requireActual("../../src/config/logger") as {
			logger: {
				info: jest.Mock<(...args: any[]) => any>;
				warn: jest.Mock<(...args: any[]) => any>;
				error: jest.Mock<(...args: any[]) => any>;
			};
		};
		expect(logger.info).toBeDefined();
		expect(logger.warn).toBeDefined();
		expect(logger.error).toBeDefined();
	});
});
