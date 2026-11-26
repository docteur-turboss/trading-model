import { describe, expect, it, jest } from "@jest/globals";

const MOCK_APP = {
	use: jest.fn<(...args: any[]) => any>(),
	get: jest.fn<(...args: any[]) => any>(),
};
const MOCK_CREATE_SECURE_SERVER = jest
	.fn<(...args: any[]) => any>()
	.mockReturnValue({ close: jest.fn<(...args: any[]) => any>() });

jest.mock("@trading-model/http/service-server-factory", () => ({
	createServiceServer: MOCK_CREATE_SECURE_SERVER,
}));

jest.mock("../../../src/adapters/inbound/http/routes", () => ({
	FINANCIAL_ROUTES: jest.fn((..._args: any[]) => MOCK_APP),
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
const MOCK_PROMISE_QUERY = jest
	.fn<(...args: any[]) => any>()
	.mockResolvedValue([[{ 1: 1 }]]);
jest.mock("../../../src/config/db", () => ({
	DATABASE: {
		query: jest.fn<(...args: any[]) => any>(),
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
	it("reports MySQL ready when the promise query succeeds", async () => {
		await expect(mysqlReadiness()()).resolves.toBe(true);
		expect(MOCK_PROMISE_QUERY).toHaveBeenCalledWith("SELECT 1");
	});

	it("reports MySQL down when the query fails", async () => {
		MOCK_PROMISE_QUERY.mockRejectedValueOnce(new Error("ECONNREFUSED"));
		await expect(mysqlReadiness()()).rejects.toThrow("ECONNREFUSED");
	});
});
