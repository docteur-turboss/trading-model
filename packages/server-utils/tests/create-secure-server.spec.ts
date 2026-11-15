import type { FilePath } from "@trading-model/primitives/primitives";

jest.mock("../src/configure-app", () => ({
	configureApp: jest.fn(),
}));

jest.mock("@trading-model/http/mtls-auth", () => ({
	MTLSAuthMiddleware: jest.fn(),
}));

jest.mock("@trading-model/http/mtls-authorization", () => ({
	MTLSAuthorizationMiddleware: jest.fn(() => "authorize-middleware"),
}));

jest.mock("@trading-model/http/response-protocol", () => ({
	ResponseProtocol: jest.fn(),
}));

jest.mock("../src/server-factory", () => ({
	createAndStartHttpsServer: jest.fn(),
}));

import { MTLSAuthMiddleware } from "@trading-model/http/mtls-auth";
import { MTLSAuthorizationMiddleware } from "@trading-model/http/mtls-authorization";
import { ResponseProtocol } from "@trading-model/http/response-protocol";
import { configureApp } from "../src/configure-app";
import {
	apiVersionPrefix,
	createSecureServer,
} from "../src/create-secure-server";
import { createAndStartHttpsServer } from "../src/server-factory";

const mockApp = { use: jest.fn() };
const mockServer = {
	close: jest.fn().mockResolvedValue(undefined),
};

describe("createSecureServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(configureApp as jest.Mock).mockReturnValue(mockApp as never);
		(createAndStartHttpsServer as jest.Mock).mockResolvedValue(mockServer);
	});

	it("should call configureApp with the trustProxy option", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem" as FilePath,
				certPath: "cert.pem" as FilePath,
				caPath: "ca.pem" as FilePath,
			},
			routes: jest.fn(),
			trustProxy: true,
		};

		await createSecureServer(options);

		expect(configureApp).toHaveBeenCalledWith({
			trustProxy: true,
		});
	});

	it("should use MTLSAuthMiddleware", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem" as FilePath,
				certPath: "cert.pem" as FilePath,
				caPath: "ca.pem" as FilePath,
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
				keyPath: "key.pem" as FilePath,
				certPath: "cert.pem" as FilePath,
				caPath: "ca.pem" as FilePath,
			},
			routes,
		};

		await createSecureServer(options);

		expect(routes).toHaveBeenCalledWith(mockApp);
	});

	it("should mount authorization middleware when authorize is set", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem" as FilePath,
				certPath: "cert.pem" as FilePath,
				caPath: "ca.pem" as FilePath,
			},
			routes: jest.fn(),
			authorize: {
				targetService: "message-manager" as never,
			},
		};

		await createSecureServer(options);

		expect(MTLSAuthorizationMiddleware).toHaveBeenCalledWith("message-manager");
		expect(mockApp.use).toHaveBeenCalledWith("authorize-middleware");
	});

	it("should not mount authorization middleware by default", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem" as FilePath,
				certPath: "cert.pem" as FilePath,
				caPath: "ca.pem" as FilePath,
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
				keyPath: "key.pem" as FilePath,
				certPath: "cert.pem" as FilePath,
				caPath: "ca.pem" as FilePath,
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
				keyPath: "key.pem" as FilePath,
				certPath: "cert.pem" as FilePath,
				caPath: "ca.pem" as FilePath,
			},
			routes: jest.fn(),
		};

		await createSecureServer(options);

		expect(createAndStartHttpsServer).toHaveBeenCalledWith(mockApp, {
			port: 443,
			tls: options.tls,
		});
	});

	it("should return the HttpServer from createAndStartHttpsServer", async () => {
		const options = {
			port: 443 as never,
			tls: {
				keyPath: "key.pem" as FilePath,
				certPath: "cert.pem" as FilePath,
				caPath: "ca.pem" as FilePath,
			},
			routes: jest.fn(),
		};

		const result = await createSecureServer(options);

		expect(result).toBe(mockServer);
	});
});

describe("apiVersionPrefix", () => {
	function run(url: string) {
		const req = { url };
		const json = jest.fn();
		const res = { status: jest.fn(() => ({ json })) };
		const next = jest.fn();
		apiVersionPrefix([2])(req as never, res as never, next);
		return { url: req.url, next, status: res.status, json };
	}

	it.each([
		["/v2/candles/symbols/BTC", "/candles/symbols/BTC"],
		["/v2?page=1", "/?page=1"],
		["/v2", "/"],
		["/candles", "/candles"],
		["/v2x/candles", "/v2x/candles"],
	])("serves %s on the routes as %s", (url, routed) => {
		const result = run(url);
		expect(result.url).toBe(routed);
		expect(result.next).toHaveBeenCalled();
	});

	it("answers 404 to a major the service does not serve", () => {
		const result = run("/v1/candles");
		expect(result.status).toHaveBeenCalledWith(404);
		expect(result.next).not.toHaveBeenCalled();
	});
});
