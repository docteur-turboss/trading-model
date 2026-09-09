import { describe, expect, it, jest } from "@jest/globals";

const mockVerifySignature = jest.fn();

jest.mock("@trading-model/crypto/domain/services/request-signer", () => ({
	verifySignature: (...args: unknown[]) => mockVerifySignature(...args),
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
		DLQ_ALLOWED_SERVICES: "message-manager,admin",
	},
	resolveAuthHmacSecret: () => "test-secret-16-chars",
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

const { serviceAuth } = jest.requireActual(
	"../../src/adapters/inbound/auth"
) as {
	serviceAuth: (
		req: Record<string, unknown>,
		res: Record<string, unknown>,
		next: () => void
	) => void;
};

describe("serviceAuth", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should call next() when service name and signature are valid", () => {
		mockVerifySignature.mockReturnValue(true);

		const req = makeRequest();
		const res = makeResponse();
		const next = jest.fn();

		serviceAuth(req as never, res as never, next);

		expect(next).toHaveBeenCalled();
	});

	it("should respond 403 when service name is not allowed", () => {
		mockVerifySignature.mockReturnValue(true);

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

		const req = makeRequest();
		const res = makeResponse();
		const next = jest.fn();

		serviceAuth(req as never, res as never, next);

		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(401);
	});

	it("should respond 403 when no service name header", () => {
		mockVerifySignature.mockReturnValue(true);

		const req = makeRequest({ headers: {} });
		const res = makeResponse();
		const next = jest.fn();

		serviceAuth(req as never, res as never, next);

		expect(next).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it("should respond 401 when timestamp header is missing", () => {
		mockVerifySignature.mockReturnValue(false);

		const req = makeRequest({
			headers: {
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
