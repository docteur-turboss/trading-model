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

/** Base application error with optional cause/reason metadata and error code. */
export class AppError extends Error {
	public readonly cause?: unknown;
	public readonly reason?: string;
	public readonly code: string;

	constructor(
		message: string,
		options?: { cause?: unknown; reason?: string; code?: string }
	) {
		super(message);
		this.name = "AppError";
		this.code = options?.code ?? "AppError";
		this.cause = options?.cause;
		this.reason = options?.reason;
	}
}

function makeErrorCode(code: string) {
	return (
		message: string,
		options?: { cause?: unknown; reason?: string }
	): AppError => new AppError(message, { ...options, code });
}

function makeGuard(code: string) {
	return (err: unknown): err is AppError =>
		err instanceof AppError && err.code === code;
}

export const serviceNotFoundError = makeErrorCode("ServiceNotFoundError");
export const isServiceNotFoundError = makeGuard("ServiceNotFoundError");

export const serviceUnreachableError = makeErrorCode("ServiceUnreachableError");
export const isServiceUnreachableError = makeGuard("ServiceUnreachableError");

export const authenticationError = makeErrorCode("AuthenticationError");
export const isAuthenticationError = makeGuard("AuthenticationError");

export const addressManagerError = makeErrorCode("AddressManagerError");
export const isAddressManagerError = makeGuard("AddressManagerError");

export const messageManagerError = makeErrorCode("MessageManagerError");
export const isMessageManagerError = makeGuard("MessageManagerError");

export const metadataBuilderError = makeErrorCode("MetadataBuilderError");
export const isMetadataBuilderError = makeGuard("MetadataBuilderError");

export const timeoutError = makeErrorCode("TimeoutError");
export const isTimeoutError = makeGuard("TimeoutError");

export const nackError = makeErrorCode("NackError");
export const isNackError = makeGuard("NackError");

export const deadLetterError = makeErrorCode("DeadLetterError");
export const isDeadLetterError = makeGuard("DeadLetterError");

export const agentError = makeErrorCode("AgentError");
export const isAgentError = makeGuard("AgentError");

export const backpressureError = makeErrorCode("BackpressureError");
export const isBackpressureError = makeGuard("BackpressureError");

export const configurationError = makeErrorCode("ConfigurationError");
export const isConfigurationError = makeGuard("ConfigurationError");
