import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { MTLSAuthMiddleware } from "@trading-model/http/mtls-auth";
import { mtlsDenialsTotal } from "@trading-model/http/outbound-metrics";
import type { NextFunction, Request, Response } from "express";

jest.mock("@trading-model/http/catch-error", () => ({
	catchSync: jest.fn((fn) => fn),
}));

jest.mock("@trading-model/http/response-exception", () => ({
	ResponseException: (data: any) => ({
		forbidden: () => {
			throw Object.assign(
				new Error(JSON.stringify({ error: "mTLS authorization failed", data })),
				{
					status: 403,
				}
			);
		},
		unauthorized: () => {
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

const countDenial = async (reason: string) =>
	(await mtlsDenialsTotal.get()).values.find((v) => v.labels.reason === reason)
		?.value;

describe("mtlsDenialsTotal", () => {
	it("exposes all 9 reasons at 0 after import", async () => {
		const values = (await mtlsDenialsTotal.get()).values;
		expect(values.map((v) => v.labels.reason).sort()).toEqual(
			[
				"caller_not_allowed",
				"caller_unresolved",
				"identity_unresolved",
				"no_client_certificate",
				"no_policy",
				"non_tls",
				"publisher_not_allowed",
				"unauthenticated",
				"unauthorized_handshake",
			].sort()
		);
	});

	it("counts a non-TLS connection", async () => {
		const before = (await countDenial("non_tls")) ?? 0;
		const next = (() => undefined) as NextFunction;
		expect(() =>
			MTLSAuthMiddleware({ socket: {} } as Request, {} as Response, next)
		).toThrow();
		expect(await countDenial("non_tls")).toBe(before + 1);
	});
});
