import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

let mockWatcher: any;
let mockWatchCallback:
	| ((eventType: string, filename: string | null) => void)
	| null;

jest.mock("node:fs", () => {
	mockWatcher = { unref: jest.fn() };
	mockWatchCallback = null;
	return {
		watch: jest.fn(
			(
				_dir: string,
				callback: (eventType: string, filename: string | null) => void
			) => {
				mockWatchCallback = callback;
				return mockWatcher;
			}
		),
		constants: { R_OK: 4 },
	};
});

jest.mock("node:fs/promises", () => ({
	access: jest.fn(() => Promise.resolve()),
	readFile: jest.fn(() =>
		Promise.resolve("-----BEGIN CERTIFICATE-----\nmock-cert-content")
	),
}));

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
	_private: class {},
}));

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { setupTlsWatcher } from "@trading-model/server-utils/server/server-factory";
import { logger } from "../../src/config/logger";
import type { FilePath } from "../../src/domain/primitives";

const TLS_CONFIG = {
	keyPath: "/path/to/key.pem" as FilePath,
	certPath: "/path/to/cert.pem" as FilePath,
	caPath: "/path/to/ca.pem" as FilePath,
};

const MOCK_SERVER = {
	setSecureContext: jest.fn(),
} as any;

describe("setupTlsWatcher", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		(fsPromises.readFile as jest.Mock).mockImplementation(() =>
			Promise.resolve("-----BEGIN CERTIFICATE-----\nmock-cert-content")
		);
		(fsPromises.access as jest.Mock).mockImplementation(() =>
			Promise.resolve()
		);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should set up watchers for each unique directory", async () => {
		await setupTlsWatcher(MOCK_SERVER, TLS_CONFIG);

		expect(fs.watch).toHaveBeenCalledTimes(1);
		expect(fs.watch).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Function)
		);
		expect(mockWatcher.unref).toHaveBeenCalled();
	});

	it("should set up watchers for multiple unique directories", async () => {
		const multiDirConfig = {
			keyPath: "/dir1/key.pem" as FilePath,
			certPath: "/dir2/cert.pem" as FilePath,
			caPath: "/dir3/ca.pem" as FilePath,
		};

		await setupTlsWatcher(MOCK_SERVER, multiDirConfig);

		expect(fs.watch).toHaveBeenCalledTimes(3);
		expect(mockWatcher.unref).toHaveBeenCalledTimes(3);
	});

	it("should log warning when directory is not readable", async () => {
		(fsPromises.access as jest.Mock).mockImplementationOnce(() =>
			Promise.reject(new Error("ENOENT"))
		);

		await setupTlsWatcher(MOCK_SERVER, TLS_CONFIG);

		expect(logger.warn).toHaveBeenCalledWith(
			"Cannot watch TLS directory",
			expect.any(Object)
		);
		expect(fs.watch).not.toHaveBeenCalled();
	});

	describe("reloadTls", () => {
		it("should reload TLS context on change event", async () => {
			await setupTlsWatcher(MOCK_SERVER, TLS_CONFIG);

			mockWatchCallback!("change", "cert.pem");
			await jest.advanceTimersByTimeAsync(350);

			expect(fsPromises.readFile).toHaveBeenCalledTimes(3);
			expect(MOCK_SERVER.setSecureContext).toHaveBeenCalledWith({
				key: "-----BEGIN CERTIFICATE-----\nmock-cert-content",
				cert: "-----BEGIN CERTIFICATE-----\nmock-cert-content",
				ca: "-----BEGIN CERTIFICATE-----\nmock-cert-content",
			});
			expect(logger.info).toHaveBeenCalledWith("TLS context reloaded", {
				context: { event: "change", file: "cert.pem" },
			});
		});

		it("should ignore non-change events", async () => {
			await setupTlsWatcher(MOCK_SERVER, TLS_CONFIG);

			mockWatchCallback!("rename", "cert.pem");
			await jest.advanceTimersByTimeAsync(350);

			expect(fsPromises.readFile).not.toHaveBeenCalled();
			expect(MOCK_SERVER.setSecureContext).not.toHaveBeenCalled();
		});

		it("should log error when TLS reload fails", async () => {
			(fsPromises.readFile as jest.Mock).mockImplementation(() =>
				Promise.reject(new Error("read failed"))
			);

			await setupTlsWatcher(MOCK_SERVER, TLS_CONFIG);

			mockWatchCallback!("change", "cert.pem");
			await jest.advanceTimersByTimeAsync(350);

			expect(logger.error).toHaveBeenCalledWith(
				"Failed to reload TLS context",
				expect.any(Object)
			);
		});

		it("should debounce multiple rapid change events", async () => {
			await setupTlsWatcher(MOCK_SERVER, TLS_CONFIG);

			mockWatchCallback!("change", "key.pem");
			mockWatchCallback!("change", "cert.pem");
			mockWatchCallback!("change", "ca.pem");
			await jest.advanceTimersByTimeAsync(350);

			expect(fsPromises.readFile).toHaveBeenCalledTimes(3);
			expect(MOCK_SERVER.setSecureContext).toHaveBeenCalledTimes(1);
		});
	});
});
