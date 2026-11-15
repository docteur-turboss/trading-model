import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../src/config/container", () => {
	const mockListen = jest.fn<(...args: any[]) => any>();
	const mockBrokerModule = jest.fn((..._args: any[]) => ({
		listen: mockListen,
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
	it("should bind the routes to the broker built at load time", () => {
		const createBrokerModule = (
			jest.requireMock("../../../src/config/container") as {
				default: jest.Mock<(...args: any[]) => { listen: unknown }>;
			}
		).default;
		expect(createBrokerModule).toHaveBeenCalledTimes(1);
		expect(MESSAGE_MANAGER_ROUTES).toBe(
			(
				createBrokerModule.mock.results[0]?.value as
					| { listen: unknown }
					| undefined
			)?.listen
		);
	});
});
