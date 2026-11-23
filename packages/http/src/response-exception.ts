import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";

/** Status value of a healthy health-check response. */
export const HEALTH_STATUS_OK = "ok" as const;
/** Type of the healthy status value. */
export type HealthStatusOk = typeof HEALTH_STATUS_OK;

/** Status and payload of a response to send to the client. */
export interface ResponseObject {
	status: HttpStatusCode;
	data: unknown;
	/** Media type of `data` when it is not JSON (a Buffer for binary content). */
	contentType?: string;
	headers?: Readonly<Record<string, string>>;
}

/**
 * Error response to throw from a handler. The reason is the body: a string is
 * sent as `{ "error": reason }`, an object as is (ResponseProtocol, ADR-0021).
 */
export const ResponseException = (reason: unknown = "") => ({
	forbidden: (): ResponseObject => ({
		status: HTTP_STATUS.FORBIDDEN,
		data: reason,
	}),
	unauthorized: (): ResponseObject => ({
		status: HTTP_STATUS.UNAUTHORIZED,
		data: reason,
	}),
});

/** Sends the data as the response body with the given HTTP status. */
export const sendResponse = (
	data: unknown,
	status: HttpStatusCode
): ResponseObject => ({
	status,
	data,
});
