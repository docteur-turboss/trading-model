import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock(
	"@trading-model/server-utils/adapters/inbound/service-server-factory",
	() => ({
		createServiceServer: jest.fn(),
	})
);

jest.mock("../../src/routes/heartbeat.routes", () => ({
	HEARTBEAT_ROUTES: jest.fn(),
}));

jest.mock("../../src/routes/register.routes", () => ({
	REGISTRY_ROUTES: jest.fn(),
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
			routes: expect.any(Function),
		});
		expect(result).toBe(mockServer);
	});

	it("should register heartbeat and registry routes", () => {
		const { createServiceServer } = jest.requireMock(
			"@trading-model/server-utils/adapters/inbound/service-server-factory"
		) as { createServiceServer: jest.Mock };
		const { HEARTBEAT_ROUTES } = jest.requireMock(
			"../../src/routes/heartbeat.routes"
		) as {
			HEARTBEAT_ROUTES: jest.Mock;
		};
		const { REGISTRY_ROUTES } = jest.requireMock(
			"../../src/routes/register.routes"
		) as {
			REGISTRY_ROUTES: jest.Mock;
		};

		const app = { use: jest.fn() };
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
});
