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

import { createHealthController } from "../../../src/adapters/inbound/http/health.controller";

describe("HealthController", () => {
	it("should return 200 with the status and a timestamp", async () => {
		const result = await createHealthController().health(
			createReq(),
			createRes(),
			createNext
		);

		expect(result).toMatchObject({ status: 200 });
		expect((result as any).data).toMatchObject({ status: "ok" });
		expect((result as any).data).toHaveProperty("timestamp");
	});
});
