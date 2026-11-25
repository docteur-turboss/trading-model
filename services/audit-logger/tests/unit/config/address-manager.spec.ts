import { describe, expect, it, jest } from "@jest/globals";

const MOCK_ADDRESS_MANAGER = {
	start: jest.fn<(...args: any[]) => any>(),
	listenExpress: jest.fn<(...args: any[]) => any>(),
	findService: jest.fn<(...args: any[]) => any>(),
};

jest.mock(
	"@trading-model/address-manager/create-service-address-manager",
	() => {
		const am = MOCK_ADDRESS_MANAGER;
		return {
			createServiceAddressManager: jest.fn((..._args: any[]) => ({
				AddressManager: am,
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
		MONGODB_URI: "mongodb://localhost:27017/audit-logger",
		AUDIT_RETENTION_DAYS: 90,
	},
}));

describe("address-manager config", () => {
	it("should export ADDRESS_MANAGER_ROUTES", () => {
		const addressManagerModule = require("../../../src/config/address-manager");

		expect(addressManagerModule.ADDRESS_MANAGER_ROUTES).toBeDefined();
		expect(addressManagerModule.ADDRESS_MANAGER_ROUTES).toBe(
			MOCK_ADDRESS_MANAGER.listenExpress
		);
	});
});
