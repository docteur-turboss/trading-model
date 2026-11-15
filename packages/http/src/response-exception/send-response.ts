import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { ResponseObject } from "./http-codes";

/** Sends the data as the response body with the given HTTP status. */
export const sendResponse = (
	data: unknown,
	status: HttpStatusCode
): ResponseObject => ({
	status,
	data,
});
