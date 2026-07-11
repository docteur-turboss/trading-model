import { describe, expect, it } from "@jest/globals";
import type { Request } from "express";
import { AclService } from "../../../src/middleware/acl-service";

function mockRequest(overrides?: Record<string, unknown>): Request {
	return {
		clientIdentity:
			(overrides?.clientIdentity as string) ??
			"spiffe://cluster.local/ns/default/sa/test-service",
		...overrides,
	} as unknown as Request;
}

describe("AclService", () => {
	it("should resolve caller name from SPIFFE identity", () => {
		const acl = new AclService();
		const req = mockRequest({
			clientIdentity: "spiffe://cluster.local/ns/default/sa/my-service",
		});
		expect(acl.resolveCallerName(req)).toBe("my-service");
	});

	it("should resolve caller from client: prefix", () => {
		const acl = new AclService();
		const req = mockRequest({ clientIdentity: "client:gateway" });
		expect(acl.resolveCallerName(req)).toBe("api-gateway");
	});

	it("should throw unauthorized when no identity", () => {
		const acl = new AclService();
		const req = mockRequest({ clientIdentity: undefined });
		expect(() => acl.resolveCallerName(req)).toThrow();
	});

	it("should authorize caller with wildcard", () => {
		const acl = new AclService({
			"test-service": ["*" as never],
		});
		expect(() =>
			acl.authorizeCaller("any-caller", "test-service")
		).not.toThrow();
	});

	it("should authorize specific caller", () => {
		const acl = new AclService({
			"test-service": ["allowed-caller" as never],
		});
		expect(() =>
			acl.authorizeCaller("allowed-caller", "test-service")
		).not.toThrow();
	});

	it("should throw forbidden for unauthorized caller", () => {
		const acl = new AclService({
			"test-service": ["allowed-caller" as never],
		});
		expect(() =>
			acl.authorizeCaller("unknown-caller", "test-service")
		).toThrow();
	});

	it("should use custom allowedCallers when provided", () => {
		const acl = new AclService();
		expect(() =>
			acl.authorizeCaller("custom-caller", "any-service", [
				"custom-caller" as never,
			])
		).not.toThrow();
	});

	it("should throw forbidden for missing ACL entry", () => {
		const acl = new AclService({});
		expect(() => acl.authorizeCaller("caller", "unknown-service")).toThrow();
	});
});
