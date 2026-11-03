import { describe, expect, it } from "@jest/globals";
import type { TlsPaths, TlsPemBundle } from "../../../src/config/tls-paths";
import {
	buildTlsFromEnv,
	fromPemBundle,
	resolveSecureContextOptions,
	toSecureContextOptions,
	toTlsConfig,
} from "../../../src/config/tls-paths";

const bundle: TlsPemBundle = {
	keyPem: "key-pem" as never,
	certPem: "cert-pem" as never,
	caPem: "ca-pem" as never,
};

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

describe("toSecureContextOptions", () => {
	it("should map the PEM bundle fields", () => {
		const options = toSecureContextOptions(bundle);
		expect(options).toEqual({
			key: "key-pem",
			cert: "cert-pem",
			ca: "ca-pem",
		});
	});
});

describe("resolveSecureContextOptions", () => {
	it("should accept a TlsPemBundle directly", () => {
		expect(resolveSecureContextOptions(bundle)).toEqual({
			key: "key-pem",
			cert: "cert-pem",
			ca: "ca-pem",
		});
	});

	it("should resolve pems from a TlsConfig", () => {
		expect(resolveSecureContextOptions({ pems: bundle })).toEqual({
			key: "key-pem",
			cert: "cert-pem",
			ca: "ca-pem",
		});
	});

	it("should throw when no PEM data is available", () => {
		const paths: TlsPaths = {
			caPath: "/etc/certs/ca.pem" as never,
			certPath: "/etc/certs/cert.pem" as never,
			keyPath: "/etc/certs/key.pem" as never,
		};
		expect(() => resolveSecureContextOptions({ paths })).toThrow(
			"Cannot resolve TLS context"
		);
	});
});

describe("toTlsConfig", () => {
	it("should wrap paths in a TlsConfig", () => {
		const paths: TlsPaths = {
			caPath: "/etc/certs/ca.pem" as never,
			certPath: "/etc/certs/cert.pem" as never,
			keyPath: "/etc/certs/key.pem" as never,
		};
		expect(toTlsConfig(paths)).toEqual({ paths });
	});
});

describe("fromPemBundle", () => {
	it("should wrap a PEM bundle in a TlsConfig", () => {
		expect(fromPemBundle(bundle)).toEqual({ pems: bundle });
	});
});
