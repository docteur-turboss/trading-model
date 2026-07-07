import { AppError } from "../utils/errors";

export class HttpClientError extends AppError {
	public readonly statusCode?: number;
	constructor(message: string, statusCode?: number) {
		super(message, { code: "HttpClientError" });
		this.name = "HttpClientError";
		this.statusCode = statusCode;
	}
}

export class HttpClientTimeoutError extends AppError {
	public readonly timeoutMs: number;
	constructor(message: string, timeoutMs: number) {
		super(message, { code: "HttpClientTimeoutError" });
		this.name = "HttpClientTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}
