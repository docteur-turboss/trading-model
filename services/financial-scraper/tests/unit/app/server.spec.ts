import { describe, expect, it, jest } from "@jest/globals";

const MOCK_APP = { use: jest.fn(), get: jest.fn() };
const MOCK_CREATE_SECURE_SERVER = jest
	.fn<any>()
	.mockReturnValue({ close: jest.fn() });

jest.mock(
	"@trading-model/server-utils/adapters/inbound/service-server-factory",
	() => ({
		createServiceServer: MOCK_CREATE_SECURE_SERVER,
	})
);

jest.mock("../../../src/config/message-manager", () => ({
	MessageManagerListenExpress: jest.fn(),
}));

jest.mock("../../../src/config/address-manager", () => ({
	ADDRESS_MANAGER_ROUTES: jest.fn((app: any) => app),
}));

jest.mock("../../../src/adapters/inbound/http/routes", () => ({
	FINANCIAL_ROUTES: jest.fn(() => MOCK_APP),
}));

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		PORT: 3000,
		TLS_KEY_PATH: "/etc/tls/key.pem",
		TLS_CERT_PATH: "/etc/tls/cert.pem",
		TLS_CA_PATH: "/etc/tls/ca.pem",
	},
}));

// Mirrors mysql2: query() on the pool is callback-based, only promise() awaits.
const MOCK_PROMISE_QUERY = jest.fn<any>().mockResolvedValue([[{ 1: 1 }]]);
jest.mock("../../../src/config/db", () => ({
	DATABASE: {
		query: jest.fn(),
		promise: () => ({ query: MOCK_PROMISE_QUERY }),
	},
}));

import { createServer } from "../../../src/application/server";

function mysqlReadiness(): () => Promise<boolean> {
	void createServer();
	const options: any = MOCK_CREATE_SECURE_SERVER.mock.calls.at(-1)?.[0];
	return options.readiness.find((check: any) => check.name === "mysql").check;
}

describe("app/server", () => {
	it("should create server", async () => {
		const server = await createServer();
		expect(server).toBeDefined();
		expect(server.close).toBeDefined();
	});

	it("should call createServiceServer with correct options", async () => {
		await createServer();
		expect(MOCK_CREATE_SECURE_SERVER).toHaveBeenCalledWith(
			expect.objectContaining({
				env: expect.objectContaining({
					PORT: 3000,
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

	it("reports MySQL ready when the promise query succeeds", async () => {
		await expect(mysqlReadiness()()).resolves.toBe(true);
		expect(MOCK_PROMISE_QUERY).toHaveBeenCalledWith("SELECT 1");
	});

	it("reports MySQL down when the query fails", async () => {
		MOCK_PROMISE_QUERY.mockRejectedValueOnce(new Error("ECONNREFUSED"));
		await expect(mysqlReadiness()()).resolves.toBe(false);
	});
});
