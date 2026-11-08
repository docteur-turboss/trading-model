import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../src/config/container", () => {
	const mockListen = jest.fn<(...args: any[]) => any>();
	const mockBrokerModule = jest.fn((..._args: any[]) => ({
		listen: mockListen,
		forwardDeadLetters: jest.fn(async (..._args: any[]) => undefined),
	}));
	return {
		__esModule: true,
		default: mockBrokerModule,
	};
});

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		TLS_CERT_PATH: "/etc/tls/cert.pem",
		TLS_KEY_PATH: "/etc/tls/key.pem",
		TLS_CA_PATH: "/etc/tls/ca.pem",
	},
}));

import { MESSAGE_MANAGER_ROUTES } from "../../../src/config/message-manager";

describe("config/message-manager", () => {
	it("should export MESSAGE_MANAGER_ROUTES", () => {
		expect(MESSAGE_MANAGER_ROUTES).toBeDefined();
	});
});
