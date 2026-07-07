/**
 * Shared Jest mock implementations for middleware.
 *
 * Use these to replace duplicated jest.mock(...) boilerplate in test files:
 *
 * @example
 * ```typescript
 * import { mockCatchSyncModule, mockSendResponseModule } from "@trading-model/common/testing";
 *
 * jest.mock("@trading-model/common/middleware/catch-error", () => mockCatchSyncModule);
 * jest.mock("@trading-model/common/middleware/response-exception", () => mockSendResponseModule);
 * ```
 */

import type { ResponseObject } from "../middleware/response-exception";

type AnyFn = (...args: never[]) => unknown;

export const mockCatchSyncModule = {
	catchSync: (fn: AnyFn): AnyFn => fn,
};

export const mockSendResponseModule = {
	sendResponse: (data: unknown, status: number): ResponseObject => ({
		status,
		data,
	}),
};
