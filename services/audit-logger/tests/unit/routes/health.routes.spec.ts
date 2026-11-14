import { describe, expect, it, jest } from "@jest/globals";
import { createNext, createReq, createRes } from "../../helpers/express";
import {
	mockCatchSyncModule,
	mockSendResponseModule,
} from "../../helpers/middleware-mocks";

jest.mock(
	"@trading-model/http/adapters/inbound/catch-error",
	() => mockCatchSyncModule
);
jest.mock(
	"@trading-model/http/adapters/inbound/response-exception",
	() => mockSendResponseModule
);

import { healthRoutes } from "../../../src/adapters/inbound/http/health.routes";

describe("healthRoutes", () => {
	it("should return 200 with the status and a timestamp", async () => {
		const handler = (healthRoutes() as any).stack[0].route.stack[0].handle;
		const result = await handler(createReq(), createRes(), createNext);

		expect(result).toMatchObject({ status: 200 });
		expect((result as any).data).toMatchObject({ status: "ok" });
		expect((result as any).data).toHaveProperty("timestamp");
	});
});
