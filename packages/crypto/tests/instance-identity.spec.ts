import {
	IPAddress,
	Port,
	ServiceId,
} from "@trading-model/primitives/primitives";
import { generateInstanceId } from "../src/application/services/instance-identity";

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
