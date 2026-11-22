jest.mock("node:https", () => ({ createServer: jest.fn() }));
jest.mock("../../src/configure-app", () => ({ configureApp: jest.fn() }));
jest.mock("../../src/mtls-auth", () => ({ MTLSAuthMiddleware: jest.fn() }));
jest.mock("../../src/mtls-authorization", () => ({
	MTLSAuthorizationMiddleware: jest.fn(() => "authorize-middleware"),
}));
jest.mock("../../src/response-protocol", () => ({
	ResponseProtocol: jest.fn(),
}));
jest.mock("../../src/http-tls-loader", () => ({
	loadTlsPemBundle: jest.fn().mockResolvedValue({
		keyPem: "fake-key",
		certPem: "fake-cert",
		caPem: "fake-ca",
	}),
}));
jest.mock("../../src/tls-watcher", () => ({
	setupTlsWatcher: jest.fn().mockResolvedValue(undefined),
}));

import https from "node:https";
import { ServiceId } from "@trading-model/primitives/primitives";
import { configureApp } from "../../src/configure-app";
import { MTLSAuthMiddleware } from "../../src/mtls-auth";
import { MTLSAuthorizationMiddleware } from "../../src/mtls-authorization";
import { ResponseProtocol } from "../../src/response-protocol";
import { createServiceServer } from "../../src/service-server-factory";
import { setupTlsWatcher } from "../../src/tls-watcher";

const ENV = {
	PORT: 3000,
	TLS_KEY_PATH: "/key.pem",
	TLS_CERT_PATH: "/cert.pem",
	TLS_CA_PATH: "/ca.pem",
};

const mockApp = { use: jest.fn() };
const listen = jest.fn();
const close = jest.fn();

describe("createServiceServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(configureApp as jest.Mock).mockReturnValue(mockApp);
		(https.createServer as jest.Mock).mockReturnValue({ listen, close });
	});

	const create = (extra = {}) => {
		const routes = jest.fn();
		return createServiceServer({
			env: { ...ENV },
			serviceId: ServiceId.of("api-gateway"),
			routes,
			...extra,
		}).then((server) => ({ server, routes }));
	};

	it("mounts mTLS, the ACL, the routes then ResponseProtocol in that order", async () => {
		const { routes } = await create({ trustProxy: true });

		expect(configureApp).toHaveBeenCalledWith({
			trustProxy: true,
			readiness: undefined,
		});
		expect(MTLSAuthorizationMiddleware).toHaveBeenCalledWith("api-gateway");
		expect(mockApp.use.mock.calls.map((c) => c[0])).toEqual([
			MTLSAuthMiddleware,
			"authorize-middleware",
			ResponseProtocol,
		]);
		expect(routes).toHaveBeenCalledWith(mockApp);
		expect(routes.mock.invocationCallOrder[0]).toBeGreaterThan(
			mockApp.use.mock.invocationCallOrder[1]
		);
		expect(routes.mock.invocationCallOrder[0]).toBeLessThan(
			mockApp.use.mock.invocationCallOrder[2]
		);
	});

	it("listens with TLSv1.3 and mandatory client certificates, and watches the certificates", async () => {
		await create();

		expect(https.createServer).toHaveBeenCalledWith(
			expect.objectContaining({
				requestCert: true,
				rejectUnauthorized: true,
				minVersion: "TLSv1.3",
			}),
			mockApp
		);
		expect(listen).toHaveBeenCalledWith(3000, expect.any(Function));
		expect(setupTlsWatcher).toHaveBeenCalledTimes(1);
	});

	it("resolves close when the server closes and rejects on error", async () => {
		const { server } = await create();

		close.mockImplementationOnce((cb) => cb());
		await expect(server.close()).resolves.toBeUndefined();
		close.mockImplementationOnce((cb) => cb(new Error("close error")));
		await expect(server.close()).rejects.toThrow("close error");
	});
});
