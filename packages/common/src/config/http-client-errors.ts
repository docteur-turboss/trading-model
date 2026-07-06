export class HttpClientError extends Error {
	public readonly statusCode?: number;
	constructor(message: string, statusCode?: number) {
		super(message);
		this.name = "HttpClientError";
		this.statusCode = statusCode;
	}
}

export class HttpClientTimeoutError extends Error {
	public readonly timeoutMs: number;
	constructor(message: string, timeoutMs: number) {
		super(message);
		this.name = "HttpClientTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}
