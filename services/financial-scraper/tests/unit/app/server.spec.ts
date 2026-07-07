import { describe, expect, it, jest } from "@jest/globals";

const MOCK_APP = { use: jest.fn() };
const MOCK_CREATE_SECURE_SERVER = jest
	.fn<any>()
	.mockReturnValue({ close: jest.fn() });

jest.mock("@trading-model/common/server/create-secure-server", () => ({
	createSecureServer: MOCK_CREATE_SECURE_SERVER,
}));

jest.mock("../../../src/config/message-manager", () => ({
	MessageManagerListenExpress: jest.fn(),
}));

jest.mock("../../../src/config/address-manager", () => ({
	ADDRESS_MANAGER_ROUTES: jest.fn((app: any) => app),
}));

jest.mock("../../../src/clients/http/routes", () => ({
	FINANCIAL_ROUTES: jest.fn(() => MOCK_APP),
}));

jest.mock("../../../src/config/env", () => ({
	ENV: {
		PORT: 3000,
		TLS_KEY_PATH: "/etc/tls/key.pem",
		TLS_CERT_PATH: "/etc/tls/cert.pem",
		TLS_CA_PATH: "/etc/tls/ca.pem",
	},
}));

import { createServer } from "../../../src/app/server";

describe("app/server", () => {
	it("should create server", async () => {
		const server = await createServer();
		expect(server).toBeDefined();
		expect(server.close).toBeDefined();
	});

	it("should call createSecureServer with correct options", async () => {
		await createServer();
		expect(MOCK_CREATE_SECURE_SERVER).toHaveBeenCalledWith(
			expect.objectContaining({
				port: 3000,
				tls: expect.objectContaining({
					keyPath: "/etc/tls/key.pem",
					certPath: "/etc/tls/cert.pem",
					caPath: "/etc/tls/ca.pem",
				}),
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
