import { describe, expect, it } from "@jest/globals";
import { loadTlsConfig } from "../../src/server/load-tls-config";

describe("loadTlsConfig", () => {
	it("should return TLS config from paths", () => {
		const result = loadTlsConfig(
			"/etc/tls/key.pem",
			"/etc/tls/cert.pem",
			"/etc/tls/ca.pem"
		);

		expect(result).toEqual({
			keyPath: "/etc/tls/key.pem",
			certPath: "/etc/tls/cert.pem",
			caPath: "/etc/tls/ca.pem",
		});
	});

	it("should return empty strings when paths are empty", () => {
		const result = loadTlsConfig("", "", "");

		expect(result).toEqual({ keyPath: "", certPath: "", caPath: "" });
	});

	it("should return TLS config with special characters in paths", () => {
		const result = loadTlsConfig(
			"C:\\Program Files\\app\\tls\\key.pem",
			"/path/with spaces/cert.pem",
			"/path/with/dashes/ca.pem"
		);

		expect(result).toEqual({
			keyPath: "C:\\Program Files\\app\\tls\\key.pem",
			certPath: "/path/with spaces/cert.pem",
			caPath: "/path/with/dashes/ca.pem",
		});
	});
});
