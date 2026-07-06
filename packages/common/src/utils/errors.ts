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

/** Base application error with optional cause/reason metadata. */
export class AppError extends Error {
	public readonly cause?: unknown;
	public readonly reason?: string;

	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message);
		this.name = "AppError";
		this.cause = options?.cause;
		this.reason = options?.reason;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export class ServiceNotFoundError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "ServiceNotFoundError";
	}
}

export class ServiceUnreachableError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "ServiceUnreachableError";
	}
}

export class AuthenticationError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "AuthenticationError";
	}
}

export class AddressManagerError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "AddressManagerError";
	}
}

export class MessageManagerError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "MessageManagerError";
	}
}

export class MetadataBuilderError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "MetadataBuilderError";
	}
}

export class TimeoutError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "TimeoutError";
	}
}

export class NackError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "NackError";
	}
}

export class DeadLetterError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "DeadLetterError";
	}
}

export class AgentError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "AgentError";
	}
}

export class BackpressureError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "BackpressureError";
	}
}

export class ConfigurationError extends AppError {
	constructor(message: string, options?: { cause?: unknown; reason?: string }) {
		super(message, options);
		this.name = "ConfigurationError";
	}
}
