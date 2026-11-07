import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ResponseObject } from "./http-codes";

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
