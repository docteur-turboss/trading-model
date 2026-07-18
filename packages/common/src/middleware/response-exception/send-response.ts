import type { HttpStatusCode } from "../../http-status";
import type { ResponseObject } from "./http-codes";

export const sendResponse = (
	data: unknown,
	status: HttpStatusCode
): ResponseObject => ({
	status,
	data,
});
