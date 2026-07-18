import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	IPAddress,
	Port,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import {
	generateInstanceId,
	verifyInstanceName,
} from "../src/crypto/instance-identity";

describe("generateInstanceId", () => {
	const endpoint = {
		serviceName: ServiceId.of("test-service"),
		host: IPAddress.of("127.0.0.1"),
		port: Port.of(3000),
	};

	it("should return a base64-encoded string", () => {
		const result = generateInstanceId(endpoint);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
		expect(result).toMatch(/^[A-Za-z0-9+/=]+$/);
	});

	it("should return different values for two calls with the same input", () => {
		const id1 = generateInstanceId(endpoint);
		const id2 = generateInstanceId(endpoint);
		expect(id1).not.toBe(id2);
	});
});

describe("verifyInstanceName", () => {
	it("should return true for valid ServiceInstanceName values", () => {
		const validNames = Object.values(ServiceInstanceName);
		for (const name of validNames) {
			expect(verifyInstanceName(name)).toBe(true);
		}
	});

	it("should return false for invalid values", () => {
		expect(
			verifyInstanceName("non-existent-service" as ServiceInstanceName)
		).toBe(false);
		expect(verifyInstanceName("some-random-name" as ServiceInstanceName)).toBe(
			false
		);
	});
});
