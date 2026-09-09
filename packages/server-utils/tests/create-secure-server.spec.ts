jest.mock("../src/adapters/inbound/configure-app", () => ({
	configureApp: jest.fn(),
}));

jest.mock("@trading-model/common/middleware/mtls-auth", () => ({
	MTLSAuthMiddleware: jest.fn(),
}));

jest.mock("@trading-model/common/middleware/mtls-authorization", () => ({
	MTLSAuthorizationMiddleware: jest.fn(() => "authorize-middleware"),
}));

jest.mock("@trading-model/common/middleware/response-protocol", () => ({
	ResponseProtocol: jest.fn(),
}));

jest.mock("../src/adapters/inbound/server-factory", () => ({
	createAndStartHttpsServer: jest.fn(),
}));

import { MTLSAuthMiddleware } from "@trading-model/common/middleware/mtls-auth";
import { MTLSAuthorizationMiddleware } from "@trading-model/common/middleware/mtls-authorization";
import { ResponseProtocol } from "@trading-model/common/middleware/response-protocol";
import { configureApp } from "../src/adapters/inbound/configure-app";
import { createSecureServer } from "../src/adapters/inbound/create-secure-server";
import { createAndStartHttpsServer } from "../src/adapters/inbound/server-factory";

const mockApp = { use: jest.fn() } as never;
const mockServer = {
	raw: {} as never,
	close: jest.fn().mockResolvedValue(undefined),
};

describe("createSecureServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(configureApp as jest.Mock).mockReturnValue(mockApp);
		(createAndStartHttpsServer as jest.Mock).mockResolvedValue(mockServer);
	});

	it("should call configureApp with rateLimit and trustProxy options", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			routes: jest.fn(),
			rateLimit: {
				windowMs: 60000 as never,
				limit: 50 as never,
			},
			trustProxy: true,
		};

		await createSecureServer(options);

		expect(configureApp).toHaveBeenCalledWith({
			rateLimit: options.rateLimit,
			trustProxy: true,
		});
	});

	it("should use MTLSAuthMiddleware", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			routes: jest.fn(),
		};

		await createSecureServer(options);

		expect(mockApp.use).toHaveBeenCalledWith(MTLSAuthMiddleware);
	});

	it("should call routes with the app", async () => {
		const routes = jest.fn();
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			routes,
		};

		await createSecureServer(options);

		expect(routes).toHaveBeenCalledWith(mockApp);
	});

	it("should mount authorization middleware when authorize.enabled is true", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			routes: jest.fn(),
			authorize: {
				targetService: "message-manager" as never,
				enabled: true,
			},
		};

		await createSecureServer(options);

		expect(MTLSAuthorizationMiddleware).toHaveBeenCalledWith(
			"message-manager",
			undefined
		);
		expect(mockApp.use).toHaveBeenCalledWith("authorize-middleware");
	});

	it("should not mount authorization middleware by default", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			routes: jest.fn(),
		};

		await createSecureServer(options);

		expect(MTLSAuthorizationMiddleware).not.toHaveBeenCalled();
	});

	it("should use ResponseProtocol after routes", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			routes: jest.fn(),
		};

		await createSecureServer(options);

		expect(mockApp.use).toHaveBeenCalledWith(ResponseProtocol);
	});

	it("should call createAndStartHttpsServer with correct options", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			routes: jest.fn(),
		};

		await createSecureServer(options);

		expect(createAndStartHttpsServer).toHaveBeenCalledWith(mockApp, {
			port: 443,
			tls: options.tls,
			watchTls: true,
		});
	});

	it("should return the HttpServer from createAndStartHttpsServer", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			routes: jest.fn(),
		};

		const result = await createSecureServer(options);

		expect(result).toBe(mockServer);
	});

	it("should pass watchTls from options when provided", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem",
				certPath: "cert.pem",
				caPath: "ca.pem",
			},
			routes: jest.fn(),
			watchTls: false,
		};

		await createSecureServer(options);

		expect(createAndStartHttpsServer).toHaveBeenCalledWith(mockApp, {
			port: 443,
			tls: options.tls,
			watchTls: false,
		});
	});
});
