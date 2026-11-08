import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock(
	"@trading-model/server-utils/adapters/inbound/service-server-factory",
	() => ({
		createServiceServer: jest.fn<(...args: any[]) => any>(),
	})
);

jest.mock("../../src/adapters/inbound/http/heartbeat.routes", () => ({
	HEARTBEAT_ROUTES: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/adapters/inbound/http/register.routes", () => ({
	REGISTRY_ROUTES: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/infrastructure/monitoring/metrics", () => ({
	metricsHandler: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		PORT: 8443,
		TLS_KEY_PATH: "/certs/key.pem",
		TLS_CERT_PATH: "/certs/cert.pem",
		TLS_CA_PATH: "/certs/ca.pem",
	},
}));

import { createServer } from "../../src/application/server";
import type { ServiceRegistry } from "../../src/domain/service-registry";

describe("createServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create a secure server with full config", () => {
		const { createServiceServer } = jest.requireMock(
			"@trading-model/server-utils/adapters/inbound/service-server-factory"
		) as { createServiceServer: jest.Mock<(...args: any[]) => any> };
		const mockServer = { close: jest.fn<(...args: any[]) => any>() };
		createServiceServer.mockReturnValue(mockServer);

		const result = createServer({} as ServiceRegistry);

		expect(createServiceServer).toHaveBeenCalledWith({
			env: {
				PORT: 8443,
				TLS_KEY_PATH: "/certs/key.pem",
				TLS_CERT_PATH: "/certs/cert.pem",
				TLS_CA_PATH: "/certs/ca.pem",
			},
			serviceId: "discovery-server",
			routes: expect.any(Function),
		});
		expect(result).toBe(mockServer);
	});

	it("should register heartbeat and registry routes", () => {
		const { createServiceServer } = jest.requireMock(
			"@trading-model/server-utils/adapters/inbound/service-server-factory"
		) as { createServiceServer: jest.Mock<(...args: any[]) => any> };
		const { HEARTBEAT_ROUTES } = jest.requireMock(
			"../../src/adapters/inbound/http/heartbeat.routes"
		) as {
			HEARTBEAT_ROUTES: jest.Mock<(...args: any[]) => any>;
		};
		const { REGISTRY_ROUTES } = jest.requireMock(
			"../../src/adapters/inbound/http/register.routes"
		) as {
			REGISTRY_ROUTES: jest.Mock<(...args: any[]) => any>;
		};

		const app = {
			use: jest.fn<(...args: any[]) => any>(),
			get: jest.fn<(...args: any[]) => any>(),
		};
		createServiceServer.mockImplementation(((opts: {
			routes: (app: { use: jest.Mock<(...args: any[]) => any> }) => void;
		}) => {
			opts.routes(app);
			return { close: jest.fn<(...args: any[]) => any>() };
		}) as unknown as (...args: unknown[]) => unknown);

		const hrRouter = { post: jest.fn<(...args: any[]) => any>() };
		const rrRouter = {
			post: jest.fn<(...args: any[]) => any>(),
			get: jest.fn<(...args: any[]) => any>(),
		};
		HEARTBEAT_ROUTES.mockReturnValue(hrRouter);
		REGISTRY_ROUTES.mockReturnValue(rrRouter);

		void createServer({} as ServiceRegistry);

		expect(app.use).toHaveBeenCalledWith("/", rrRouter);
		expect(app.use).toHaveBeenCalledWith("/", hrRouter);
	});
});
