import { describe, expect, it, jest } from "@jest/globals";

process.env.TLS_KEY_PATH = "/etc/tls/key.pem";
process.env.TLS_CERT_PATH = "/etc/tls/cert.pem";
process.env.TLS_CA_PATH = "/etc/tls/ca.pem";
process.env.APP_NAME = "financial-scraper";
process.env.SERVICE_NAME = "financial-scraper";
process.env.INSTANCE_ID = "instance-1";
process.env.ADDRESS_MANAGER_URL = "https://address-manager.example.com";

const MOCK_CREATE_POOL = jest.fn<(...args: any[]) => any>().mockReturnValue({});

jest.mock("mysql2", () => ({
	createPool: MOCK_CREATE_POOL,
}));

jest.mock("ts-sql-query/connections/MySqlConnection", () => ({
	MySqlConnection: class {},
}));

jest.mock("ts-sql-query/queryRunners/MySql2PoolQueryRunner", () => ({
	MySql2PoolQueryRunner: jest.fn<(...args: any[]) => any>(),
}));

import { MySqlConnection } from "ts-sql-query/connections/MySqlConnection";
import { createDBConnection, DATABASE } from "../../../src/config/db";

describe("config/db", () => {
	it("should export the pool it created", () => {
		expect(DATABASE).toBe(MOCK_CREATE_POOL.mock.results[0]?.value);
	});

	it("should create a MySqlConnection", () => {
		expect(createDBConnection()).toBeInstanceOf(MySqlConnection);
	});

	it("should create pool with expected config", () => {
		expect(MOCK_CREATE_POOL).toHaveBeenCalledWith(
			expect.objectContaining({ connectionLimit: 10 })
		);
	});
});
