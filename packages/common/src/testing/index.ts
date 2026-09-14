/**
 * Shared Jest mock implementations for middleware.
 *
 * Use these to replace duplicated jest.mock(...) boilerplate in test files:
 *
 * @example
 * ```typescript
 * import { mockCatchSyncModule, mockSendResponseModule } from "@trading-model/common/testing";
 *
 * jest.mock("@trading-model/http/adapters/inbound/catch-error", () => mockCatchSyncModule);
 * jest.mock("@trading-model/http/adapters/inbound/response-exception", () => mockSendResponseModule);
 * ```
 */

import type { HttpStatusCode } from "../http-status";

type AnyFn = (...args: never[]) => unknown;

interface ResponseObject {
	status: HttpStatusCode;
	data: unknown;
}

export const mockCatchSyncModule = {
	catchSync: (fn: AnyFn): AnyFn => fn,
};

export const mockSendResponseModule = {
	sendResponse: (data: unknown, status: HttpStatusCode): ResponseObject => ({
		status,
		data,
	}),
	HEALTH_STATUS_OK: "ok",
};
