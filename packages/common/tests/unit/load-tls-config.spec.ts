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
			key: "/etc/tls/key.pem",
			cert: "/etc/tls/cert.pem",
			ca: "/etc/tls/ca.pem",
		});
	});

	it("should return empty strings when paths are empty", () => {
		const result = loadTlsConfig("", "", "");

		expect(result).toEqual({ key: "", cert: "", ca: "" });
	});

	it("should return TLS config with special characters in paths", () => {
		const result = loadTlsConfig(
			"C:\\Program Files\\app\\tls\\key.pem",
			"/path/with spaces/cert.pem",
			"/path/with/dashes/ca.pem"
		);

		expect(result).toEqual({
			key: "C:\\Program Files\\app\\tls\\key.pem",
			cert: "/path/with spaces/cert.pem",
			ca: "/path/with/dashes/ca.pem",
		});
	});
});
