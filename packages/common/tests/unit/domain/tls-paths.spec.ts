import { describe, expect, it } from "@jest/globals";
import { buildTlsFromEnv } from "../../../src/domain/tls-paths";

describe("buildTlsFromEnv", () => {
	it("should create a TlsPaths object from env dictionary", () => {
		const paths = buildTlsFromEnv({
			TLS_CERT_PATH: "/etc/certs/cert.pem",
			TLS_KEY_PATH: "/etc/certs/key.pem",
			TLS_CA_PATH: "/etc/certs/ca.pem",
		});
		expect(paths.certPath).toBe("/etc/certs/cert.pem");
		expect(paths.keyPath).toBe("/etc/certs/key.pem");
		expect(paths.caPath).toBe("/etc/certs/ca.pem");
	});

	it("should preserve the exact values from env", () => {
		const paths = buildTlsFromEnv({
			TLS_CERT_PATH: "certs\\client-cert.pem",
			TLS_KEY_PATH: "certs\\client-key.pem",
			TLS_CA_PATH: "certs\\ca.pem",
		});
		expect(paths.certPath).toBe("certs\\client-cert.pem");
		expect(paths.keyPath).toBe("certs\\client-key.pem");
		expect(paths.caPath).toBe("certs\\ca.pem");
	});

	it("should use FilePath validation (throws on empty string)", () => {
		expect(() =>
			buildTlsFromEnv({
				TLS_CERT_PATH: "",
				TLS_KEY_PATH: "/etc/certs/key.pem",
				TLS_CA_PATH: "/etc/certs/ca.pem",
			})
		).toThrow("FilePath must be a non-empty string");
	});

	it("should throw when any path is empty", () => {
		expect(() =>
			buildTlsFromEnv({
				TLS_CERT_PATH: "/etc/certs/cert.pem",
				TLS_KEY_PATH: "",
				TLS_CA_PATH: "/etc/certs/ca.pem",
			})
		).toThrow("FilePath must be a non-empty string");

		expect(() =>
			buildTlsFromEnv({
				TLS_CERT_PATH: "/etc/certs/cert.pem",
				TLS_KEY_PATH: "/etc/certs/key.pem",
				TLS_CA_PATH: "",
			})
		).toThrow("FilePath must be a non-empty string");
	});
});
