import { describe, expect, it, jest } from "@jest/globals";
import { AppError } from "@trading-model/common/utils/errors";

jest.mock("../../src/config/env", () => ({
	ENV: {
		MONGO_URI: "mongodb://localhost:27017",
		MONGO_DB: "test",
		MONGO_COLLECTION: "dlq",
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		MAX_ENTRIES: 100,
		DLQ_AUTO_RETRY_LIMIT: 50,
		MESSAGE_MANAGER_URL: "https://message-manager:3000",
		INSTANCE_ID: "test",
		TLS_CA_PATH: "",
		TLS_CERT_PATH: "",
		TLS_KEY_PATH: "",
		DLQ_ALLOWED_SERVICES: "message-manager,admin",
		DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
		DLQ_PRUNE_INTERVAL_MS: 60000,
		DLQ_AUTO_RETRY_ENABLED: true,
		DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/config/db", () => ({
	getCollection: jest.fn(),
}));

function createMockSpan() {
	return {
		setStatus: jest.fn(),
		end: jest.fn(),
		recordException: jest.fn(),
	};
}

describe("dlq-error-builder", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("validationFail", () => {
		it("should return validation failure response", () => {
			const { validationFail } = jest.requireActual(
				"../../src/dlq/dlq-error-builder"
			) as {
				validationFail: (...args: unknown[]) => {
					valid: false;
					response: Record<string, unknown>;
				};
			};
			const span = createMockSpan();
			const result = validationFail(span, "Invalid input", 400);

			expect(result.valid).toBe(false);
			expect((result.response as Record<string, unknown>).status).toBe(400);
			expect(span.setStatus).toHaveBeenCalled();
			expect(span.end).toHaveBeenCalled();
		});

		it("should include extra fields in response", () => {
			const { validationFail } = jest.requireActual(
				"../../src/dlq/dlq-error-builder"
			) as {
				validationFail: (...args: unknown[]) => {
					valid: false;
					response: Record<string, unknown>;
				};
			};
			const span = createMockSpan();
			const result = validationFail(span, "Invalid", 422, {
				code: "VALIDATION_ERROR",
			});

			expect(result.valid).toBe(false);
			expect((result.response as Record<string, unknown>).data).toEqual({
				error: "Invalid",
				code: "VALIDATION_ERROR",
			});
		});
	});

	describe("handleAddEntryError", () => {
		it("should handle capacity error", () => {
			const { handleAddEntryError } = jest.requireActual(
				"../../src/dlq/dlq-error-builder"
			) as {
				handleAddEntryError: (
					err: unknown,
					span: Record<string, unknown>
				) => Record<string, unknown>;
			};
			const span = createMockSpan();
			const capacityErr = new AppError("capacity", {
				code: "DlqCapacityError",
			});

			const result = handleAddEntryError(capacityErr, span);
			expect(result.status).toBe(429);
		});

		it("should handle storage error", () => {
			const { handleAddEntryError } = jest.requireActual(
				"../../src/dlq/dlq-error-builder"
			) as {
				handleAddEntryError: (
					err: unknown,
					span: Record<string, unknown>
				) => Record<string, unknown>;
			};
			const span = createMockSpan();
			const storageErr = new Error("MongoDB down");

			const result = handleAddEntryError(storageErr, span);
			expect(result.status).toBe(503);
			expect(span.recordException).toHaveBeenCalledWith(storageErr);
		});
	});
});
