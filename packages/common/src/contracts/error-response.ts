import type { HttpStatusCode } from "../http-status";

export interface ErrorResponse {
	code: string;
	message: string;
	statusCode?: HttpStatusCode;
}
