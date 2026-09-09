jest.mock("node:https", () => ({
	createServer: jest.fn(),
}));

jest.mock("@trading-model/common/config/http-tls-loader", () => ({
	loadTlsPemBundle: jest.fn().mockResolvedValue({
		keyPem: "fake-key",
		certPem: "fake-cert",
		caPem: "fake-ca",
	}),
}));

import https from "node:https";
import { loadTlsPemBundle } from "@trading-model/common/config/http-tls-loader";
import { createAndStartHttpsServer } from "../src/adapters/inbound/server-factory";

describe("createAndStartHttpsServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create an HTTPS server and start listening", async () => {
		const listen = jest.fn();
		(https.createServer as jest.Mock).mockReturnValue({
			listen,
			close: jest.fn(),
		});

		const app = {} as never;
		const options = {
			port: 3000 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			watchTls: false,
		};

		const result = await createAndStartHttpsServer(app, options as never);

		expect(loadTlsPemBundle).toHaveBeenCalledWith(options.tls);
		expect(https.createServer).toHaveBeenCalledTimes(1);
		expect(listen).toHaveBeenCalledWith(3000, expect.any(Function));
		expect(result).toHaveProperty("raw");
		expect(result).toHaveProperty("close");
		expect(typeof result.close).toBe("function");
	});

	it("should configure TLSv1.3 and mTLS options", async () => {
		const listen = jest.fn();
		(https.createServer as jest.Mock).mockReturnValue({
			listen,
			close: jest.fn(),
		});

		const app = {} as never;
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			watchTls: false,
		};

		await createAndStartHttpsServer(app, options as never);

		expect(https.createServer).toHaveBeenCalledWith(
			expect.objectContaining({
				requestCert: true,
				rejectUnauthorized: true,
				minVersion: "TLSv1.3",
			}),
			app
		);
	});

	it("should NOT call setupTlsWatcher when watchTls is false", async () => {
		const listen = jest.fn();
		const close = jest.fn((cb?: (err?: Error) => void) => cb?.());
		(https.createServer as jest.Mock).mockReturnValue({ listen, close });

		const app = {} as never;
		const options = {
			port: 3000 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			watchTls: false,
		};

		const result = await createAndStartHttpsServer(app, options as never);

		expect(result).toBeDefined();
	});

	describe("HttpServer close", () => {
		it("should resolve when server.close succeeds", async () => {
			const listen = jest.fn();
			(https.createServer as jest.Mock).mockReturnValue({
				listen,
				close: jest.fn((cb) => cb()),
			});

			const app = {} as never;
			const options = {
				port: 3000 as never,
				tls: {
					keyPath: "key.pem",
					certPath: "cert.pem",
					caPath: "ca.pem",
				},
				watchTls: false,
			};

			const result = await createAndStartHttpsServer(app, options as never);
			await expect(result.close()).resolves.toBeUndefined();
		});

		it("should reject when server.close fails", async () => {
			const listen = jest.fn();
			(https.createServer as jest.Mock).mockReturnValue({
				listen,
				close: jest.fn((cb) => cb(new Error("close error"))),
			});

			const app = {} as never;
			const options = {
				port: 3000 as never,
				tls: {
					keyPath: "key.pem",
					certPath: "cert.pem",
					caPath: "ca.pem",
				},
				watchTls: false,
			};

			const result = await createAndStartHttpsServer(app, options as never);
			await expect(result.close()).rejects.toThrow("close error");
		});
	});
});
