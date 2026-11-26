import { describe, expect, it } from "@jest/globals";
import { AclService } from "@trading-model/http/acl-service";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { Request } from "express";

function mockRequest(overrides?: Record<string, unknown>): Request {
	return {
		clientIdentity:
			(overrides?.clientIdentity as string) ??
			"spiffe://trading-model.local/ns/default/sa/test-service",
		...overrides,
	} as unknown as Request;
}

describe("AclService", () => {
	it("should resolve caller name from SPIFFE identity", () => {
		const acl = new AclService();
		const req = mockRequest({
			clientIdentity: "spiffe://trading-model.local/ns/default/sa/my-service",
		});
		expect(acl.resolveCallerName(req)).toBe(ServiceId.of("my-service"));
	});

	it("should refuse a client: identity", () => {
		const acl = new AclService();
		const req = mockRequest({ clientIdentity: "client:gateway" });
		expect(() => acl.resolveCallerName(req)).toThrow();
	});

	it("should throw unauthorized when no identity", () => {
		const acl = new AclService();
		const req = mockRequest({ clientIdentity: undefined });
		expect(() => acl.resolveCallerName(req)).toThrow();
	});

	it("should authorize specific caller", () => {
		const acl = new AclService({
			"test-service": [ServiceId.of("allowed-caller")],
		});
		expect(() =>
			acl.authorizeCaller(
				ServiceId.of("allowed-caller"),
				ServiceId.of("test-service")
			)
		).not.toThrow();
	});

	it("should throw forbidden for unauthorized caller", () => {
		const acl = new AclService({
			"test-service": [ServiceId.of("allowed-caller")],
		});
		expect(() =>
			acl.authorizeCaller(
				ServiceId.of("unknown-caller"),
				ServiceId.of("test-service")
			)
		).toThrow();
	});

	it("should use custom allowedCallers when provided", () => {
		const acl = new AclService();
		expect(() =>
			acl.authorizeCaller(
				ServiceId.of("custom-caller"),
				ServiceId.of("any-service"),
				[ServiceId.of("custom-caller")]
			)
		).not.toThrow();
	});

	it("should throw forbidden for missing ACL entry", () => {
		const acl = new AclService({});
		expect(() =>
			acl.authorizeCaller(
				ServiceId.of("caller"),
				ServiceId.of("unknown-service")
			)
		).toThrow();
	});
});

describe("AclService denial metric", () => {
	it("counts a denied caller", async () => {
		const { mtlsDenialsTotal } = await import(
			"@trading-model/http/outbound-metrics"
		);
		const count = async () =>
			(await mtlsDenialsTotal.get()).values.find(
				(v) => v.labels.reason === "caller_not_allowed"
			)?.value ?? 0;
		const before = await count();
		const acl = new AclService({ "test-service": [ServiceId.of("other")] });
		expect(() =>
			acl.authorizeCaller(ServiceId.of("me"), ServiceId.of("test-service"))
		).toThrow();
		expect(await count()).toBe(before + 1);
	});
});
