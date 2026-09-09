import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/infrastructure/config/env", () => ({
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

const mockIsDbConnected = jest.fn();
jest.mock("../../src/config/db", () => ({
	isDbConnected: mockIsDbConnected,
}));

function createMockSpan() {
	return {
		setStatus: jest.fn(),
		end: jest.fn(),
		setAttribute: jest.fn(),
		recordException: jest.fn(),
	};
}

describe("dlq-validator", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockIsDbConnected.mockReturnValue(true);
	});

	it("should validate a correct entry body", () => {
		const { validateAddEntryBody } = jest.requireActual(
			"../../src/adapters/inbound/dlq-validator"
		) as {
			validateAddEntryBody: (...args: unknown[]) => {
				valid: boolean;
				data?: Record<string, unknown>;
				response?: Record<string, unknown>;
			};
		};
		const span = createMockSpan();
		const result = validateAddEntryBody(
			{
				topic: "test.topic",
				message: { foo: "bar" },
				reason: "timeout",
				deliveryAttempt: 1,
				timestamp: "2024-01-01T00:00:00.000Z",
			},
			span
		);

		expect(result.valid).toBe(true);
	});

	it("should reject an invalid entry body (missing deliveryAttempt)", () => {
		const { validateAddEntryBody } = jest.requireActual(
			"../../src/adapters/inbound/dlq-validator"
		) as {
			validateAddEntryBody: (...args: unknown[]) => {
				valid: boolean;
				response?: Record<string, unknown>;
			};
		};
		const span = createMockSpan();
		const result = validateAddEntryBody(
			{
				message: "test",
				timestamp: "2024-01-01T00:00:00.000Z",
			},
			span
		);

		expect(result.valid).toBe(false);
		expect((result.response as Record<string, unknown>).status).toBe(400);
	});

	it("should reject message exceeding 5MB", () => {
		const { validateAddEntryBody } = jest.requireActual(
			"../../src/adapters/inbound/dlq-validator"
		) as {
			validateAddEntryBody: (...args: unknown[]) => {
				valid: boolean;
				response?: Record<string, unknown>;
			};
		};
		const span = createMockSpan();
		const largeMessage = "x".repeat(6 * 1024 * 1024);
		const result = validateAddEntryBody(
			{
				message: largeMessage,
				deliveryAttempt: 1,
				timestamp: "2024-01-01T00:00:00.000Z",
			},
			span
		);

		expect(result.valid).toBe(false);
		expect((result.response as Record<string, unknown>).status).toBe(400);
	});

	it("should return 503 when db is not connected", () => {
		mockIsDbConnected.mockReturnValue(false);
		const { validateAddEntryBody } = jest.requireActual(
			"../../src/adapters/inbound/dlq-validator"
		) as {
			validateAddEntryBody: (...args: unknown[]) => {
				valid: boolean;
				response?: Record<string, unknown>;
			};
		};
		const span = createMockSpan();
		const result = validateAddEntryBody(
			{
				message: "test",
				deliveryAttempt: 1,
				timestamp: "2024-01-01T00:00:00.000Z",
			},
			span
		);

		expect(result.valid).toBe(false);
		expect((result.response as Record<string, unknown>).status).toBe(503);
	});
});
