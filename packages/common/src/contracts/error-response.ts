import type { HttpStatusCode } from "../http-status";

/** Standard error response shape used across API and WebSocket responses. */
export interface ErrorResponse {
	code: string;
	message: string;
	statusCode?: HttpStatusCode;
}
