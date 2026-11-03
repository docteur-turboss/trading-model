import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock(
	"@trading-model/server-utils/adapters/inbound/service-server-factory",
	() => ({
		createServiceServer: jest.fn(),
	})
);

jest.mock("../../src/adapters/inbound/http/heartbeat.routes", () => ({
	HEARTBEAT_ROUTES: jest.fn(),
}));

jest.mock("../../src/adapters/inbound/http/register.routes", () => ({
	REGISTRY_ROUTES: jest.fn(),
}));

jest.mock("../../src/infrastructure/monitoring/metrics", () => ({
	metricsHandler: jest.fn(),
	trackRequest: jest.fn(),
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
		) as { createServiceServer: jest.Mock };
		const mockServer = { close: jest.fn() };
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
		) as { createServiceServer: jest.Mock };
		const { HEARTBEAT_ROUTES } = jest.requireMock(
			"../../src/adapters/inbound/http/heartbeat.routes"
		) as {
			HEARTBEAT_ROUTES: jest.Mock;
		};
		const { REGISTRY_ROUTES } = jest.requireMock(
			"../../src/adapters/inbound/http/register.routes"
		) as {
			REGISTRY_ROUTES: jest.Mock;
		};

		const app = { use: jest.fn(), get: jest.fn() };
		createServiceServer.mockImplementation(((opts: {
			routes: (app: { use: jest.Mock }) => void;
		}) => {
			opts.routes(app);
			return { close: jest.fn() };
		}) as unknown as (...args: unknown[]) => unknown);

		const hrRouter = { post: jest.fn() };
		const rrRouter = { post: jest.fn(), get: jest.fn() };
		HEARTBEAT_ROUTES.mockReturnValue(hrRouter);
		REGISTRY_ROUTES.mockReturnValue(rrRouter);

		void createServer({} as ServiceRegistry);

		expect(app.use).toHaveBeenCalledWith("/", rrRouter);
		expect(app.use).toHaveBeenCalledWith("/", hrRouter);
	});

	it("should track request metrics through the http middleware", () => {
		const { createServiceServer } = jest.requireMock(
			"@trading-model/server-utils/adapters/inbound/service-server-factory"
		) as { createServiceServer: jest.Mock };
		const { trackRequest } = jest.requireMock(
			"../../src/infrastructure/monitoring/metrics"
		) as {
			trackRequest: jest.Mock;
		};

		const app = { use: jest.fn(), get: jest.fn() };
		createServiceServer.mockImplementation(((opts: {
			routes: (app: { use: jest.Mock; get: jest.Mock }) => void;
		}) => {
			opts.routes(app);
			return { close: jest.fn() };
		}) as unknown as (...args: unknown[]) => unknown);

		void createServer({} as ServiceRegistry);

		const middleware = app.use.mock.calls[0][0] as (
			req: { method: string; path: string },
			res: { statusCode: number; on: jest.Mock },
			next: jest.Mock
		) => void;

		const req = { method: "GET", path: "/heartbeat" };
		const res = { statusCode: 200, on: jest.fn() };
		const next = jest.fn();

		middleware(req, res, next);

		expect(next).toHaveBeenCalled();

		const finishHandler = res.on.mock.calls[0][1] as () => void;
		finishHandler();

		expect(trackRequest).toHaveBeenCalledWith({
			method: "GET",
			path: "/heartbeat",
			status: 200,
			durationMs: expect.any(Number),
		});
	});
});
