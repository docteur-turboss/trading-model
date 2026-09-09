import { describe, expect, it, jest } from "@jest/globals";

const MOCK_ADDRESS_MANAGER = {
	start: jest.fn(),
	listenExpress: jest.fn(),
	findService: jest.fn(),
};

jest.mock(
	"@trading-model/address-manager/application/create-service-address-manager",
	() => {
		const am = MOCK_ADDRESS_MANAGER;
		return {
			createServiceAddressManager: jest.fn(() => ({
				AddressManager: am,
				BOOTSTRAP_ADDRESS_MANAGER: am.start,
				ADDRESS_MANAGER_ROUTES: am.listenExpress,
				FIND_A_SERVICE: am.findService,
			})),
		};
	}
);

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		NODE_ENV: "test",
		PORT: 3001,
		TLS_KEY_PATH: "/some/key.pem",
		TLS_CERT_PATH: "/some/cert.pem",
		TLS_CA_PATH: "/some/ca.pem",
		APP_NAME: "audit-logger",
		SERVICE_NAME: "audit",
		INSTANCE_ID: "instance-1",
		ADDRESS_MANAGER_URL: "https://address-manager:3000",
		CACHE_TTL_MS: 30000,
		SERVICE_PING_TIMEOUT_MS: 2000,
		DISCOVERY_TIMEOUT_MS: 5000,
		TOKEN_REFRESH_INTERVAL_MS: 60000,
		TTL_REFRESH_INTERVAL_MS: 15000,
		MONGODB_URI: "mongodb://localhost:27017/audit-logger",
		MAX_QUEUE_DEPTH: 10000,
		MAX_WORKER_LOAD_RATIO: 0.85,
		ACK_TIMEOUT_MS: 30000,
		MAX_RETRIES_PER_JOB: 3,
		ORPHAN_SCAN_INTERVAL_MS: 10000,
		WORKER_HEARTBEAT_TTL_MS: 30000,
		GAP_DETECTION_INTERVAL_MS: 60000,
		AUDIT_RETENTION_DAYS: 90,
	},
}));

describe("address-manager config", () => {
	it("should export ADDRESS_MANAGER_ROUTES, BOOTSTRAP_ADDRESS_MANAGER, and AddressManager", () => {
		const addressManagerModule = require("../../../src/config/address-manager");

		expect(addressManagerModule.ADDRESS_MANAGER_ROUTES).toBeDefined();
		expect(addressManagerModule.ADDRESS_MANAGER_ROUTES).toBe(
			MOCK_ADDRESS_MANAGER.listenExpress
		);
		expect(addressManagerModule.BOOTSTRAP_ADDRESS_MANAGER).toBeDefined();
		expect(addressManagerModule.BOOTSTRAP_ADDRESS_MANAGER).toBe(
			MOCK_ADDRESS_MANAGER.start
		);
		expect(addressManagerModule.AddressManager).toBeDefined();
		expect(addressManagerModule.AddressManager).toBe(MOCK_ADDRESS_MANAGER);
	});
});
