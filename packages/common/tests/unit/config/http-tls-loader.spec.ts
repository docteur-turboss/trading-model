import { describe, expect, it, jest } from "@jest/globals";

jest.mock("node:fs", () => ({
	readFileSync: jest.fn((path: string) => {
		if (path.includes("ca")) {
			return "-----BEGIN CERTIFICATE-----\nmock-ca";
		}
		if (path.includes("cert")) {
			return "-----BEGIN CERTIFICATE-----\nmock-cert";
		}
		if (path.includes("key")) {
			return "-----BEGIN RSA PRIVATE KEY-----\nmock-key";
		}
		return "-----BEGIN CERTIFICATE-----\ndefault";
	}),
}));

import {
	buildHttpsAgentOptions,
	loadTlsPemBundleSync,
} from "../../../src/config/http-tls-loader";
import type { FilePath } from "../../../src/domain/primitives/file-path";

const caPath = "/etc/tls/ca.pem" as unknown as FilePath;
const certPath = "/etc/tls/cert.pem" as unknown as FilePath;
const keyPath = "/etc/tls/key.pem" as unknown as FilePath;
const emptyPath = "" as unknown as FilePath;

describe("loadTlsPemBundleSync", () => {
	it("should return empty object when no config", () => {
		expect(loadTlsPemBundleSync()).toEqual({});
	});

	it("should load CA certificate only", () => {
		const result = loadTlsPemBundleSync({
			caPath,
			certPath: emptyPath,
			keyPath: emptyPath,
		});
		expect(result.caPem).toBeDefined();
		expect(result.certPem).toBeUndefined();
		expect(result.keyPem).toBeUndefined();
	});

	it("should load client certificate only", () => {
		const result = loadTlsPemBundleSync({
			caPath: emptyPath,
			certPath,
			keyPath: emptyPath,
		});
		expect(result.caPem).toBeUndefined();
		expect(result.certPem).toBeDefined();
		expect(result.keyPem).toBeUndefined();
	});

	it("should load client key only", () => {
		const result = loadTlsPemBundleSync({
			caPath: emptyPath,
			certPath: emptyPath,
			keyPath,
		});
		expect(result.caPem).toBeUndefined();
		expect(result.certPem).toBeUndefined();
		expect(result.keyPem).toBeDefined();
	});

	it("should load all TLS files", () => {
		const result = loadTlsPemBundleSync({ caPath, certPath, keyPath });
		expect(result.caPem).toBeDefined();
		expect(result.certPem).toBeDefined();
		expect(result.keyPem).toBeDefined();
	});
});

describe("buildHttpsAgentOptions", () => {
	it("should return undefined when config is empty", () => {
		expect(buildHttpsAgentOptions()).toBeUndefined();
	});

	it("should build agent options with all fields", () => {
		const opts = buildHttpsAgentOptions({ caPath, certPath, keyPath });
		expect(opts).toBeDefined();
		expect(opts!.ca).toContain("-----BEGIN CERTIFICATE-----");
		expect(opts!.cert).toContain("-----BEGIN CERTIFICATE-----");
		expect(opts!.key).toContain("-----BEGIN RSA PRIVATE KEY-----");
	});
});
