import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

let mockMtime = 1;
jest.mock("node:fs", () => ({
	statSync: jest.fn((..._args: any[]) => ({
		mtimeMs: mockMtime,
		ino: 1,
		size: 1,
	})),
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

import fs from "node:fs";
import {
	buildHttpsAgentOptions,
	loadTlsPemBundleSync,
	TLS_RELOAD_CHECK_INTERVAL_MS,
} from "@trading-model/http/infrastructure/http-tls-loader";
import type { FilePath } from "@trading-model/primitives/primitives/file-path";

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

	it("should disable hostname verification when a custom trust bundle is present", () => {
		const opts = buildHttpsAgentOptions({ caPath, certPath, keyPath });
		expect(opts!.checkServerIdentity).toBeDefined();
	});

	it("should keep hostname verification when verifyHostname is true", () => {
		const opts = buildHttpsAgentOptions({ caPath, certPath, keyPath }, true);
		expect(opts!.checkServerIdentity).toBeUndefined();
	});
});

describe("loadTlsPemBundleSync cache", () => {
	const paths = {
		caPath: "/rot/ca.pem" as unknown as FilePath,
		certPath: "/rot/cert.pem" as unknown as FilePath,
		keyPath: "/rot/key.pem" as unknown as FilePath,
	};
	const read = fs.readFileSync as unknown as jest.Mock<(...args: any[]) => any>;
	let now = 1_000_000;
	beforeEach(() => {
		jest.spyOn(Date, "now").mockImplementation(() => now);
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("reads once, rereads all three after mtime change past the interval, keeps old bundle on failure", () => {
		read.mockClear();
		const first = loadTlsPemBundleSync(paths);
		loadTlsPemBundleSync(paths);
		expect(read).toHaveBeenCalledTimes(3);

		mockMtime = 2;
		now += 1000;
		expect(loadTlsPemBundleSync(paths)).toBe(first); // inside interval
		expect(read).toHaveBeenCalledTimes(3);

		now += TLS_RELOAD_CHECK_INTERVAL_MS;
		const second = loadTlsPemBundleSync(paths);
		expect(second).not.toBe(first);
		expect(read).toHaveBeenCalledTimes(6);

		mockMtime = 3;
		now += TLS_RELOAD_CHECK_INTERVAL_MS;
		read.mockImplementationOnce(() => {
			throw new Error("boom");
		});
		jest.spyOn(process, "emitWarning").mockImplementation(() => undefined);
		expect(loadTlsPemBundleSync(paths)).toBe(second);
	});
});
