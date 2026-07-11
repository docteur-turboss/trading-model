import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("logger", () => {
	it("should re-export logger from common", () => {
		const { logger } = jest.requireActual("../../src/config/logger") as {
			logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
		};
		expect(logger.info).toBeDefined();
		expect(logger.warn).toBeDefined();
		expect(logger.error).toBeDefined();
	});
});
