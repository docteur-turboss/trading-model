/**
 * Normalize an unknown error into a proper Error instance.
 *
 * - If already an `Error`, returns it unchanged.
 * - If a `string`, wraps it in `new Error(...)`.
 * - If an object with a `message` property, wraps `String(err.message)`.
 * - Otherwise, wraps `String(err)`.
 *
 * Use this in every `catch` block so that downstream code (logging, error
 * serialisation, `instanceof` checks) always receives a well-shaped Error.
 */
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

export type ErrorCode =
	| "ServiceNotFoundError"
	| "ServiceUnreachableError"
	| "AuthenticationError"
	| "AddressManagerError"
	| "MessageManagerError"
	| "MetadataBuilderError"
	| "TimeoutError"
	| "NackError"
	| "DeadLetterError"
	| "AgentError"
	| "BackpressureError"
	| "ConfigurationError"
	| "AppError"
	| "DlqCapacityError"
	| "JobStatusError";

export const ErrorCode = {
	ServiceNotFound: "ServiceNotFoundError" as ErrorCode,
	ServiceUnreachable: "ServiceUnreachableError" as ErrorCode,
	Authentication: "AuthenticationError" as ErrorCode,
	AddressManager: "AddressManagerError" as ErrorCode,
	MessageManager: "MessageManagerError" as ErrorCode,
	MetadataBuilder: "MetadataBuilderError" as ErrorCode,
	Timeout: "TimeoutError" as ErrorCode,
	Nack: "NackError" as ErrorCode,
	DeadLetter: "DeadLetterError" as ErrorCode,
	Agent: "AgentError" as ErrorCode,
	Backpressure: "BackpressureError" as ErrorCode,
	Configuration: "ConfigurationError" as ErrorCode,
	AppError: "AppError" as ErrorCode,
} as const;

/** Base application error with optional cause/reason metadata and error code. */
export class AppError extends Error {
	public readonly cause?: unknown;
	public readonly reason?: string;
	public readonly code: ErrorCode;

	constructor(
		message: string,
		options?: { cause?: unknown; reason?: string; code?: ErrorCode }
	) {
		super(message);
		this.name = "AppError";
		this.code = options?.code ?? ErrorCode.AppError;
		this.cause = options?.cause;
		this.reason = options?.reason;
	}
}

function makeErrorCode(code: ErrorCode) {
	return (
		message: string,
		options?: { cause?: unknown; reason?: string }
	): AppError => new AppError(message, { ...options, code });
}

function makeGuard(code: ErrorCode) {
	return (err: unknown): err is AppError =>
		err instanceof AppError && err.code === code;
}

export const serviceNotFoundError = makeErrorCode(ErrorCode.ServiceNotFound);
export const isServiceNotFoundError = makeGuard(ErrorCode.ServiceNotFound);

export const serviceUnreachableError = makeErrorCode(
	ErrorCode.ServiceUnreachable
);
export const isServiceUnreachableError = makeGuard(
	ErrorCode.ServiceUnreachable
);

export const authenticationError = makeErrorCode(ErrorCode.Authentication);
export const isAuthenticationError = makeGuard(ErrorCode.Authentication);

export const addressManagerError = makeErrorCode(ErrorCode.AddressManager);
export const isAddressManagerError = makeGuard(ErrorCode.AddressManager);

export const messageManagerError = makeErrorCode(ErrorCode.MessageManager);
export const isMessageManagerError = makeGuard(ErrorCode.MessageManager);

export const metadataBuilderError = makeErrorCode(ErrorCode.MetadataBuilder);
export const isMetadataBuilderError = makeGuard(ErrorCode.MetadataBuilder);

export const timeoutError = makeErrorCode(ErrorCode.Timeout);
export const isTimeoutError = makeGuard(ErrorCode.Timeout);

export const nackError = makeErrorCode(ErrorCode.Nack);
export const isNackError = makeGuard(ErrorCode.Nack);

export const deadLetterError = makeErrorCode(ErrorCode.DeadLetter);
export const isDeadLetterError = makeGuard(ErrorCode.DeadLetter);

export const agentError = makeErrorCode(ErrorCode.Agent);
export const isAgentError = makeGuard(ErrorCode.Agent);

export const backpressureError = makeErrorCode(ErrorCode.Backpressure);
export const isBackpressureError = makeGuard(ErrorCode.Backpressure);

export const configurationError = makeErrorCode(ErrorCode.Configuration);
export const isConfigurationError = makeGuard(ErrorCode.Configuration);
