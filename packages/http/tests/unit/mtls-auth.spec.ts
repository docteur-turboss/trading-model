import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/http/catch-error", () => ({
	catchSync: jest.fn((fn) => fn),
}));

jest.mock("@trading-model/http/response-exception", () => ({
	ResponseException: (data: any) => ({
		Forbidden: () => {
			throw Object.assign(
				new Error(JSON.stringify({ error: "mTLS authorization failed", data })),
				{
					status: 403,
				}
			);
		},
		Unauthorized: () => {
			throw Object.assign(
				new Error(
					JSON.stringify(data ?? { error: "Client certificate required" })
				),
				{
					status: 401,
				}
			);
		},
	}),
}));

import { MTLSAuthMiddleware } from "@trading-model/http/mtls-auth";

describe("MTLSAuthMiddleware", () => {
	let req: any;
	let res: any;
	let next: jest.Mock<(...args: any[]) => any>;

	beforeEach(() => {
		req = { socket: {} };
		res = {};
		next = jest.fn<(...args: any[]) => any>();
	});

	it("should throw Forbidden when socket is not a TLSSocket", () => {
		req.socket = { constructor: { name: "Socket" } };

		expect(() => MTLSAuthMiddleware(req, res, next)).toThrow();
	});

	it("should throw Forbidden when socket is not authorized", () => {
		req.socket = {
			authorized: false,
			authorizationError: "unauthorized client",
			getPeerCertificate: jest.fn<(...args: any[]) => any>(),
		};

		expect(() => MTLSAuthMiddleware(req, res, next)).toThrow();
	});

	it("should throw Unauthorized when no client certificate", () => {
		req.socket = {
			authorized: true,
			authorizationError: undefined,
			getPeerCertificate: jest.fn((..._args: any[]) => ({})),
		};

		expect(() => MTLSAuthMiddleware(req, res, next)).toThrow();
	});

	const svid = (ns: string, sa: string, td = "trading-model.local") =>
		`URI:spiffe://${td}/ns/${ns}/sa/${sa}`;
	const withCert = (
		peer: unknown,
		own: unknown = { subjectaltname: svid("prod", "me") }
	) => {
		req.socket = {
			authorized: true,
			authorizationError: undefined,
			getPeerCertificate: jest.fn((..._args: any[]) => peer),
			getCertificate: jest.fn((..._args: any[]) => own),
		};
	};

	it("should extract the SPIFFE ID of a peer in our namespace", () => {
		withCert({ subjectaltname: `DNS:x, ${svid("prod", "risk-execution")}` });

		void MTLSAuthMiddleware(req, res, next);

		expect(req.clientIdentity).toBe(
			"spiffe://trading-model.local/ns/prod/sa/risk-execution"
		);
		expect(next).toHaveBeenCalled();
	});

	it.each([
		[
			"a CN only",
			{ subjectaltname: undefined, subject: { CN: "risk-execution" } },
		],
		["a non-SPIFFE SAN", { subjectaltname: "DNS:risk-execution" }],
		[
			"another trust domain",
			{ subjectaltname: svid("prod", "api-gateway", "other.domain") },
		],
		["another namespace", { subjectaltname: svid("autre", "api-gateway") }],
	])("should reject a peer with %s", (_name, peer) => {
		withCert(peer);

		expect(() => MTLSAuthMiddleware(req, res, next)).toThrow();
		expect(next).not.toHaveBeenCalled();
	});
});
