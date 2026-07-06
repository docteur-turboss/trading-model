import { describe, expect, it } from "@jest/globals";
import { loadTlsConfig } from "../../src/server/load-tls-config";

describe("loadTlsConfig", () => {
	it("should return TLS config from paths", () => {
		const paths = {
			keyPath: "/etc/tls/key.pem",
			certPath: "/etc/tls/cert.pem",
			caPath: "/etc/tls/ca.pem",
		};
		const result = loadTlsConfig(paths);

		expect(result).toBe(paths);
	});

	it("should return TLS config with special characters in paths", () => {
		const paths = {
			keyPath: "C:\\Program Files\\app\\tls\\key.pem",
			certPath: "/path/with spaces/cert.pem",
			caPath: "/path/with/dashes/ca.pem",
		};
		const result = loadTlsConfig(paths);

		expect(result).toEqual(paths);
	});
});
