import type { ErrorResponse } from "../contracts/error-response";
import type { HttpStatusCode } from "../http-status";

export class HttpClientError extends Error {
	public readonly statusCode?: HttpStatusCode;
	public readonly code = "HttpClientError";
	constructor(message: string, statusCode?: HttpStatusCode) {
		super(message);
		this.name = "HttpClientError";
		this.statusCode = statusCode;
	}

	toErrorResponse(): ErrorResponse {
		return {
			code: this.code,
			message: this.message,
			statusCode: this.statusCode,
		};
	}
}

export class HttpClientTimeoutError extends Error {
	public readonly timeoutMs: number;
	public readonly code = "HttpClientTimeoutError";
	constructor(message: string, timeoutMs: number) {
		super(message);
		this.name = "HttpClientTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}
