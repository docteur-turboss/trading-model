import type { HttpStatusCode } from "@trading-model/common/http-status";

/** Standard error response shape used across API and WebSocket responses. */
export interface ErrorResponse {
	code: string;
	message: string;
	statusCode?: HttpStatusCode;
}
