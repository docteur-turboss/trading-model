import { describe, expect, it, jest } from "@jest/globals";

const mockVerifySignature = jest.fn();
const mockNormalizeBody = jest.fn();

jest.mock("@trading-model/common/crypto/request-signer", () => ({
	verifySignature: (...args: unknown[]) => mockVerifySignature(...args),
	normalizeBody: (...args: unknown[]) => mockNormalizeBody(...args),
}));

jest.mock("../../src/config/env", () => ({
	ENV: {
		DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
		DLQ_ALLOWED_SERVICES: "message-manager,admin",
	},
	resolveAuthHmacSecret: () => "test-secret-16-chars",
}));

jest.mock("node:crypto", () => ({
	createHmac: jest.fn(() => ({
		update: jest.fn(() => ({
			digest: jest.fn(() => "expected-signature"),
		})),
	})),
	timingSafeEqual: jest.fn((a: Buffer, b: Buffer) => {
		return a.toString() === b.toString();
	}),
}));

function makeRequest(overrides: Record<string, unknown> = {}) {
	return {
		headers: {
			"x-service-name": "message-manager",
			"x-signature": "valid-signature",
			"x-timestamp": String(Date.now()),
			...(overrides.headers || {}),
		},
		method: "POST",
		path: "/dlq",
		body: { topic: "test" },
		...overrides,
	};
}

function makeResponse() {
	const res: Record<string, unknown> = {};
	res.status = jest.fn((code: number) => {
		res.statusCode = code;
		res.json = jest.fn();
		return res;
	});
	return res as unknown as {
		status: jest.Mock;
		json?: jest.Mock;
		statusCode?: number;
	};
}

describe("auth", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockNormalizeBody.mockImplementation((body: unknown) => body);
	});

	it("should call next() when service name and signature are valid", () => {
		mockVerifySignature.mockReturnValue(true);

		const { serviceAuth } = jest.requireActual("../../src/dlq/auth") as {
			serviceAuth: (
				req: Record<string, unknown>,
				res: Record<string, unknown>,
				next: () => void
			) => void;
		};

		const req = makeRequest();
		const res = makeResponse();
		const next = jest.fn();

		serviceAuth(req as never, res as never, next);

		expect(next).toHaveBeenCalled();
	});

	it("should respond 403 when service name is not allowed", () => {
		mockVerifySignature.mockReturnValue(true);

		const { serviceAuth } = jest.requireActual("../../src/dlq/auth") as {
			serviceAuth: (
				req: Record<string, unknown>,
				res: Record<string, unknown>,
				next: () => void
			) => void;
		};

		const req = makeRequest({
			headers: { "x-service-name": "unknown-service" },
		});
		const res = makeResponse();
		const next = jest.fn();

		serviceAuth(req as never, res as never, next);

		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it("should respond 401 when signature is invalid", () => {
		mockVerifySignature.mockReturnValue(false);

		const { serviceAuth } = jest.requireActual("../../src/dlq/auth") as {
			serviceAuth: (
				req: Record<string, unknown>,
				res: Record<string, unknown>,
				next: () => void
			) => void;
		};

		const req = makeRequest();
		const res = makeResponse();
		const next = jest.fn();

		serviceAuth(req as never, res as never, next);

		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(401);
	});

	it("should respond 403 when no service name header", () => {
		mockVerifySignature.mockReturnValue(true);

		const { serviceAuth } = jest.requireActual("../../src/dlq/auth") as {
			serviceAuth: (
				req: Record<string, unknown>,
				res: Record<string, unknown>,
				next: () => void
			) => void;
		};

		const req = makeRequest({ headers: {} });
		const res = makeResponse();
		const next = jest.fn();

		serviceAuth(req as never, res as never, next);

		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it("should fallback to crypto-based signature when sharedVerifySignature fails", () => {
		mockVerifySignature.mockReturnValue(false);

		const { serviceAuth } = jest.requireActual("../../src/dlq/auth") as {
			serviceAuth: (
				req: Record<string, unknown>,
				res: Record<string, unknown>,
				next: () => void
			) => void;
		};

		const crypto = require("node:crypto");
		crypto.timingSafeEqual.mockImplementation(
			(a: Buffer, b: Buffer) => a.toString() === b.toString()
		);
		crypto.createHmac.mockImplementation(() => ({
			update: jest.fn(() => ({
				digest: jest.fn(() => "expected-signature"),
			})),
		}));

		const req = makeRequest({
			headers: {
				"x-signature": "expected-signature",
				"x-timestamp": String(Date.now()),
				"x-service-name": "message-manager",
			},
		});
		const res = makeResponse();
		const next = jest.fn();

		serviceAuth(req as never, res as never, next);

		expect(next).toHaveBeenCalled();
	});

	it("should respond 401 when timestamp header is missing", () => {
		mockVerifySignature.mockReturnValue(false);

		const { serviceAuth } = jest.requireActual("../../src/dlq/auth") as {
			serviceAuth: (
				req: Record<string, unknown>,
				res: Record<string, unknown>,
				next: () => void
			) => void;
		};

		const req = makeRequest({
			headers: {
				"x-timestamp": "not-a-number",
				"x-signature": "sig",
				"x-service-name": "message-manager",
			},
		});
		const res = makeResponse();
		const next = jest.fn();

		serviceAuth(req as never, res as never, next);

		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(401);
	});
});
