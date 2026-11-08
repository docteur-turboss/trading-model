import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_APP = {
	use: jest.fn<(...args: any[]) => any>(),
	post: jest.fn<(...args: any[]) => any>(),
	get: jest.fn<(...args: any[]) => any>(),
};

const MOCK_SERVER = {
	raw: MOCK_APP,
};

const MOCK_TLS_CONFIG = {
	key: "/some/key.pem",
	cert: "/some/cert.pem",
	ca: "/some/ca.pem",
};

const MOCK_MESSAGE_HANDLER = jest.fn<(...args: any[]) => any>();
const MOCK_HEALTH_ROUTES = jest.fn<(...args: any[]) => any>();
const MOCK_EVENTS_ROUTES = jest.fn<(...args: any[]) => any>();
jest.mock(
	"@trading-model/server-utils/adapters/inbound/create-secure-server",
	() => ({
		createSecureServer: jest.fn((..._args: any[]) =>
			Promise.resolve(MOCK_SERVER)
		),
		buildTlsFromEnv: jest.fn((..._args: any[]) => MOCK_TLS_CONFIG),
	})
);

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		PORT: 3001,
		NODE_ENV: "test",
		TLS_KEY_PATH: "/some/key.pem",
		TLS_CERT_PATH: "/some/cert.pem",
		TLS_CA_PATH: "/some/ca.pem",
		APP_NAME: "audit-logger",
		SERVICE_NAME: "audit",
		INSTANCE_ID: "instance-1",
		ADDRESS_MANAGER_URL: "https://address-manager:3000",
	},
}));

jest.mock("../../../src/adapters/inbound/http/health.routes", () => ({
	healthRoutes: jest.fn((..._args: any[]) => MOCK_HEALTH_ROUTES),
}));

jest.mock("../../../src/adapters/inbound/http/events.routes", () => ({
	eventsRoutes: jest.fn((..._args: any[]) => MOCK_EVENTS_ROUTES),
}));

jest.mock("../../../src/config/address-manager", () => ({
	ADDRESS_MANAGER_ROUTES: jest.fn<(...args: any[]) => any>(),
}));

jest.mock(
	"../../../src/adapters/inbound/subscription/audit-subscriber",
	() => ({
		createMessageHandler: jest.fn((..._args: any[]) => MOCK_MESSAGE_HANDLER),
	})
);

import { createSecureServer } from "@trading-model/server-utils/adapters/inbound/create-secure-server";
import { eventsRoutes } from "../../../src/adapters/inbound/http/events.routes";
import { healthRoutes } from "../../../src/adapters/inbound/http/health.routes";
import { createServer } from "../../../src/application/server";

describe("createServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create a secure server and register all routes", async () => {
		const auditRepo = { insert: jest.fn<(...args: any[]) => any>() } as any;
		const mongoManager = {
			isConnected: jest.fn((..._args: any[]) => true),
		} as any;

		const server = await createServer(
			auditRepo,
			mongoManager,
			MOCK_MESSAGE_HANDLER as never
		);

		expect(server).toBe(MOCK_SERVER);
		expect(createSecureServer).toHaveBeenCalledWith(
			expect.objectContaining({
				port: 3001,
				tls: MOCK_TLS_CONFIG,
			})
		);

		const secureServerOptions = (
			createSecureServer as jest.Mock<(...args: any[]) => any>
		).mock.calls[0][0] as any;

		secureServerOptions.routes(MOCK_APP);

		expect(healthRoutes).toHaveBeenCalledWith();
		expect(eventsRoutes).toHaveBeenCalledWith(auditRepo);

		expect(MOCK_APP.use).toHaveBeenCalledWith("/", MOCK_HEALTH_ROUTES);
		expect(MOCK_APP.use).toHaveBeenCalledWith("/", MOCK_EVENTS_ROUTES);
		// POST /message is mounted from AUDIT_API.receive on its own router.
		const brokerRouter = MOCK_APP.use.mock.calls
			.map((call) => call[0] as { stack?: Array<{ route?: { path: string } }> })
			.find(
				(arg) => typeof arg === "function" && (arg as { stack?: unknown }).stack
			);
		expect(brokerRouter?.stack?.[0]?.route?.path).toBe("/message");
	});
});
