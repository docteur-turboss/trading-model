import { describe, expect, it, jest } from "@jest/globals";

const MOCK_APP = { use: jest.fn() };
const MOCK_CREATE_SECURE_SERVER = jest
	.fn<any>()
	.mockReturnValue({ close: jest.fn() });

jest.mock(
	"@trading-model/server-utils/adapters/inbound/service-server-factory",
	() => ({
		createServiceServer: MOCK_CREATE_SECURE_SERVER,
	})
);

jest.mock("config/address-manager", () => ({
	ADDRESS_MANAGER_ROUTES: jest.fn(),
}));

jest.mock("config/message-manager", () => ({
	MESSAGE_MANAGER_ROUTES: jest.fn((app: any) => app),
}));

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		PORT: 3000,
		TLS_KEY_PATH: "/etc/tls/key.pem",
		TLS_CERT_PATH: "/etc/tls/cert.pem",
		TLS_CA_PATH: "/etc/tls/ca.pem",
	},
}));

import { createServer } from "../../../src/infrastructure/app/server";

describe("app/server", () => {
	it("should create server", () => {
		const server = createServer();
		expect(server).toBeDefined();
		expect(server.close).toBeDefined();
	});

	it("should call createServiceServer with correct options", () => {
		void createServer();
		expect(MOCK_CREATE_SECURE_SERVER).toHaveBeenCalledWith(
			expect.objectContaining({
				env: expect.objectContaining({
					PORT: 3000,
				}),
				trustProxy: true,
			})
		);
	});

	it("should register routes callback", () => {
		void createServer();
		const options: any = MOCK_CREATE_SECURE_SERVER.mock.calls[0][0];
		expect(typeof options.routes).toBe("function");
		expect(() => options.routes(MOCK_APP)).not.toThrow();
	});
});
