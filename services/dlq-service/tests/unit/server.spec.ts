import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_SERVICE_SERVER = jest.fn<(...args: any[]) => any>();

jest.mock("@trading-model/http/service-server-factory", () => ({
	createServiceServer: MOCK_CREATE_SERVICE_SERVER,
}));
jest.mock("../../src/infrastructure/config/env", () => ({ ENV: {} }));
jest.mock("../../src/adapters/inbound/routes", () => ({
	DlqRoutes: jest.fn(),
}));

import { createServer } from "../../src/application/server";

describe("createServer readiness", () => {
	it("gates readiness on mongo only, not on the discovery registration", () => {
		const mongo = { name: "mongo", check: () => false };

		void createServer({} as any, mongo);

		const options: any = MOCK_CREATE_SERVICE_SERVER.mock.calls[0][0];
		expect(options.readiness).toEqual([mongo]);
	});
});
