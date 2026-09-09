import { HTTP_STATUS } from "../../http-status";

export function normalizeError(err: unknown): Error {
	if (err instanceof Error) {
		return err;
	}
	if (typeof err === "string") {
		return new Error(err);
	}
	if (err && typeof err === "object" && "message" in err) {
		return new Error(String((err as Record<string, unknown>).message));
	}
	return new Error(`Unknown error: ${String(err)}`);
}

export enum ErrorCode {
	ServiceNotFound = "ServiceNotFoundError",
	ServiceUnreachable = "ServiceUnreachableError",
	Authentication = "AuthenticationError",
	AddressManager = "AddressManagerError",
	MessageManager = "MessageManagerError",
	MetadataBuilder = "MetadataBuilderError",
	Timeout = "TimeoutError",
	Nack = "NackError",
	DeadLetter = "DeadLetterError",
	Agent = "AgentError",
	Backpressure = "BackpressureError",
	Configuration = "ConfigurationError",
	DlqCapacity = "DlqCapacityError",
	JobStatus = "JobStatusError",
	AppError = "AppErrorError",
	HttpClient = "HttpClientError",
	HttpClientTimeout = "HttpClientTimeoutError",
}

export interface AppErrorData {
	readonly name: "AppError";
	readonly message: string;
	readonly cause?: unknown;
	readonly reason?: string;
	readonly code: ErrorCode;
	readonly httpStatus: number;
}

export type AppError = Error & AppErrorData;

export function createAppError(
	message: string,
	options?: {
		cause?: unknown;
		reason?: string;
		code?: ErrorCode;
		httpStatus?: number;
	}
): AppError {
	return Object.assign(new Error(message), {
		name: "AppError",
		code: options?.code ?? ErrorCode.AppError,
		cause: options?.cause,
		reason: options?.reason,
		httpStatus: options?.httpStatus ?? HTTP_STATUS.INTERNAL_SERVER_ERROR,
	}) as AppError;
}

export function isAppError(err: unknown): err is AppError {
	return (
		typeof err === "object" &&
		err !== null &&
		(err as AppError).name === "AppError"
	);
}

export function makeErrorCode(code: ErrorCode, httpStatus?: number) {
	return (
		message: string,
		options?: { cause?: unknown; reason?: string }
	): AppError => createAppError(message, { ...options, code, httpStatus });
}

export function makeGuard(code: ErrorCode) {
	return (err: unknown): err is AppError =>
		isAppError(err) && err.code === code;
}
