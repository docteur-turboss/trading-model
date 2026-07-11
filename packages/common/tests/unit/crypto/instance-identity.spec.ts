import { describe, expect, it } from "@jest/globals";
import {
	generateInstanceId,
	verifyInstanceName,
} from "../../../src/crypto/instance-identity";

describe("generateInstanceId", () => {
	it("should generate a non-empty string", () => {
		const id = generateInstanceId({
			serviceName: "test-service" as never,
			host: "127.0.0.1" as never,
			port: 3000 as never,
		});
		expect(typeof id).toBe("string");
		expect(id.length).toBeGreaterThan(0);
	});

	it("should generate different IDs for different inputs", () => {
		const id1 = generateInstanceId({
			serviceName: "svc1" as never,
			host: "127.0.0.1" as never,
			port: 3000 as never,
		});
		const id2 = generateInstanceId({
			serviceName: "svc2" as never,
			host: "127.0.0.2" as never,
			port: 4000 as never,
		});
		expect(id1).not.toBe(id2);
	});
});

describe("verifyInstanceName", () => {
	it("should return true for valid service names", () => {
		expect(verifyInstanceName("audit-logger-service" as never)).toBe(true);
	});
});
