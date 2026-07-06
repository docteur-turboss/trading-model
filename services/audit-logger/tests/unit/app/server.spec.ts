import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_APP = {
	use: jest.fn(),
	post: jest.fn(),
};

const MOCK_SERVER = {
	raw: MOCK_APP,
};

const MOCK_TLS_CONFIG = {
	key: "/some/key.pem",
	cert: "/some/cert.pem",
	ca: "/some/ca.pem",
};

const MOCK_MESSAGE_HANDLER = jest.fn();
const MOCK_HEALTH_ROUTES = jest.fn();
const MOCK_EVENTS_ROUTES = jest.fn();
jest.mock("@trading-model/common/server/create-secure-server", () => ({
	createSecureServer: jest.fn(() => Promise.resolve(MOCK_SERVER)),
}));

jest.mock("../../../src/config/env", () => ({
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

jest.mock("../../../src/routes/health.routes", () => ({
	healthRoutes: jest.fn(() => MOCK_HEALTH_ROUTES),
}));

jest.mock("../../../src/routes/events.routes", () => ({
	eventsRoutes: jest.fn(() => MOCK_EVENTS_ROUTES),
}));

jest.mock("../../../src/config/address-manager", () => ({
	ADDRESS_MANAGER_ROUTES: jest.fn(),
}));

jest.mock("../../../src/subscription/audit-subscriber", () => ({
	createMessageHandler: jest.fn(() => MOCK_MESSAGE_HANDLER),
}));

import { createSecureServer } from "@trading-model/common/server/create-secure-server";
import { createServer } from "../../../src/app/server";
import { eventsRoutes } from "../../../src/routes/events.routes";
import { healthRoutes } from "../../../src/routes/health.routes";

describe("createServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should create a secure server and register all routes", async () => {
		const scheduler = {
			workers: "workers-mock",
			queue: "queue-mock",
			backPressure: "back-pressure-mock",
		} as any;
		const auditRepo = { insert: jest.fn() } as any;

		const server = await createServer(scheduler, auditRepo);

		expect(server).toBe(MOCK_SERVER);
		expect(createSecureServer).toHaveBeenCalledWith(
			expect.objectContaining({
				port: 3001,
				tls: MOCK_TLS_CONFIG,
			})
		);

		const secureServerOptions = (createSecureServer as jest.Mock).mock
			.calls[0][0] as any;

		secureServerOptions.routes(MOCK_APP);

		expect(healthRoutes).toHaveBeenCalledWith(
			scheduler.queue,
			scheduler.backPressure,
			scheduler.workers
		);
		expect(eventsRoutes).toHaveBeenCalledWith(auditRepo);

		expect(MOCK_APP.use).toHaveBeenCalledWith("/", MOCK_HEALTH_ROUTES);
		expect(MOCK_APP.use).toHaveBeenCalledWith("/", MOCK_EVENTS_ROUTES);
		expect(MOCK_APP.post).toHaveBeenCalledWith(
			"/message",
			MOCK_MESSAGE_HANDLER
		);
	});
});
