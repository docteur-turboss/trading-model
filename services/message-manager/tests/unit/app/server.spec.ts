import { describe, expect, it, jest } from "@jest/globals";

const MOCK_APP = { use: jest.fn<(...args: any[]) => any>() };
const MOCK_CREATE_SECURE_SERVER = jest
	.fn<(...args: any[]) => any>()
	.mockReturnValue({ close: jest.fn<(...args: any[]) => any>() });

jest.mock("@trading-model/http/service-server-factory", () => ({
	createServiceServer: MOCK_CREATE_SECURE_SERVER,
}));

jest.mock("config/address-manager", () => ({
	ADDRESS_MANAGER_ROUTES: jest.fn<(...args: any[]) => any>(),
	REGISTRATION_READINESS: { name: "discovery-registration", check: () => true },
}));

jest.mock("config/message-manager", () => ({
	MESSAGE_MANAGER_ROUTES: jest.fn((app: any) => app),
}));

const MOCK_ENV: Record<string, unknown> = {
	PORT: 3000,
	TLS_KEY_PATH: "/etc/tls/key.pem",
	TLS_CERT_PATH: "/etc/tls/cert.pem",
	TLS_CA_PATH: "/etc/tls/ca.pem",
};
jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: MOCK_ENV,
}));

import { createServer } from "../../../src/application/server";

describe("app/server", () => {
	it("should create server", async () => {
		const server = await createServer();
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

	it("should check Redis in its readiness", () => {
		void createServer();
		const options: any = MOCK_CREATE_SECURE_SERVER.mock.calls.at(-1)?.[0];
		expect(options.readiness.map((r: { name: string }) => r.name)).toContain(
			"redis"
		);
	});
});
