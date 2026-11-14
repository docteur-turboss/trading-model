import { describe, expect, it } from "@jest/globals";
import { MTLSAuthMiddleware } from "@trading-model/http/adapters/inbound/mtls-auth";
import { mtlsDenialsTotal } from "@trading-model/http/infrastructure/outbound-metrics";
import type { NextFunction, Request, Response } from "express";

const count = async (reason: string) =>
	(await mtlsDenialsTotal.get()).values.find((v) => v.labels.reason === reason)
		?.value;

describe("mtlsDenialsTotal", () => {
	it("exposes all 8 reasons at 0 after import", async () => {
		const values = (await mtlsDenialsTotal.get()).values;
		expect(values.map((v) => v.labels.reason).sort()).toEqual(
			[
				"caller_not_allowed",
				"caller_unresolved",
				"identity_unresolved",
				"no_client_certificate",
				"no_policy",
				"non_tls",
				"unauthenticated",
				"unauthorized_handshake",
			].sort()
		);
	});

	it("counts a non-TLS connection", async () => {
		const before = (await count("non_tls")) ?? 0;
		const next = (() => undefined) as NextFunction;
		void MTLSAuthMiddleware({ socket: {} } as Request, {} as Response, next);
		expect(await count("non_tls")).toBe(before + 1);
	});
});
