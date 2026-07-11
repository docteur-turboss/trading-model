import { describe, expect, it } from "@jest/globals";
import { HTTP_STATUS } from "../../../src/http-status";
import {
	mockCatchSyncModule,
	mockSendResponseModule,
} from "../../../src/testing/index";

describe("mockCatchSyncModule", () => {
	it("should return the same function", () => {
		const fn = () => "test";
		const wrapped = mockCatchSyncModule.catchSync(fn);
		expect(wrapped).toBe(fn);
		expect(wrapped()).toBe("test");
	});
});

describe("mockSendResponseModule", () => {
	it("should return a response object", () => {
		const result = mockSendResponseModule.sendResponse(
			{ key: "value" },
			HTTP_STATUS.OK
		);
		expect(result).toEqual({ status: 200, data: { key: "value" } });
	});
});
