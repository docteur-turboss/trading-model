const mockWatch = jest.fn().mockReturnValue({ unref: jest.fn() });
const mockAccess = jest.fn().mockResolvedValue(undefined);

jest.mock("node:fs", () => ({
	constants: { R_OK: 4 },
	watch: mockWatch,
}));

jest.mock("node:fs/promises", () => ({
	access: mockAccess,
}));

import path from "node:path";
import { setupTlsWatcher } from "../src/server/tls-watcher";

describe("setupTlsWatcher", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create a single watcher when all files are in the same directory", async () => {
		const server = {} as never;
		const tls = {
			keyPath: "certs/key.pem",
			certPath: "certs/cert.pem",
			caPath: "certs/ca.pem",
		};

		await setupTlsWatcher(server, tls as never);

		expect(mockWatch).toHaveBeenCalledTimes(1);
		expect(mockAccess).toHaveBeenCalledWith(
			path.resolve("certs"),
			expect.any(Number)
		);
	});

	it("should create watchers for each unique directory", async () => {
		const server = {} as never;
		const tls = {
			keyPath: "keys/key.pem",
			certPath: "certs/cert.pem",
			caPath: "certs/ca.pem",
		};

		await setupTlsWatcher(server, tls as never);

		expect(mockWatch).toHaveBeenCalledTimes(2);
	});

	it("should handle inaccessible directories gracefully", async () => {
		mockAccess.mockRejectedValueOnce(new Error("EACCES: permission denied"));
		mockAccess.mockResolvedValueOnce(undefined);

		const server = {} as never;
		const tls = {
			keyPath: "keys/key.pem",
			certPath: "certs/cert.pem",
			caPath: "certs/ca.pem",
		};

		await setupTlsWatcher(server, tls as never);

		expect(mockWatch).toHaveBeenCalledTimes(1);
		expect(mockWatch).toHaveBeenCalledWith(
			path.resolve("certs"),
			expect.any(Function)
		);
	});

	it("should unref each watcher", async () => {
		const unref = jest.fn();
		mockWatch.mockReturnValue({ unref });

		const server = {} as never;
		const tls = {
			keyPath: "certs/key.pem",
			certPath: "certs/cert.pem",
			caPath: "certs/ca.pem",
		};

		await setupTlsWatcher(server, tls as never);

		expect(unref).toHaveBeenCalledTimes(1);
	});

	it("should handle all directories inaccessible", async () => {
		mockAccess.mockRejectedValue(new Error("EACCES"));

		const server = {} as never;
		const tls = {
			keyPath: "keys/key.pem",
			certPath: "certs/cert.pem",
			caPath: "other/ca.pem",
		};

		await setupTlsWatcher(server, tls as never);

		expect(mockWatch).not.toHaveBeenCalled();
	});
});
