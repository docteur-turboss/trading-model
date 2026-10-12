import type { HttpStatusCode } from "@trading-model/common/http-status";

type AnyFn = (...args: never[]) => unknown;

interface ResponseObject {
	status: HttpStatusCode;
	data: unknown;
}

/** Shared jest.mock replacement for @trading-model/http catch-error middleware. */
export const mockCatchSyncModule = {
	catchSync: (fn: AnyFn): AnyFn => fn,
};

/** Shared jest.mock replacement for @trading-model/http response-exception middleware. */
export const mockSendResponseModule = {
	sendResponse: (data: unknown, status: HttpStatusCode): ResponseObject => ({
		status,
		data,
	}),
	HEALTH_STATUS_OK: "ok",
};
