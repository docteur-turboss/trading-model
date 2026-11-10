import type { Span } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";
import {
	type AppError,
	ErrorCode,
	isAppError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";

export const STORAGE_UNAVAILABLE = {
	error: "Storage unavailable — message not persisted. Retry later.",
	code: "STORAGE_UNAVAILABLE",
} as const;

export function isDlqCapacityError(err: unknown): err is AppError {
	return isAppError(err) && err.code === ErrorCode.DlqCapacity;
}

/** Closes the span of a request refused with a business reason. */
export function rejectSpan(span: Span, message: string): void {
	span.setStatus({ code: SpanStatusCode.ERROR, message });
	span.end();
}

/** Logs a storage failure and closes the span of the request it failed. */
export function failSpanOnStorageError(span: Span, err: unknown): void {
	logger.error("Failed to persist DLQ entry — storage error", {
		error: normalizeError(err).message,
	});
	span.recordException(normalizeError(err));
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: normalizeError(err).message,
	});
	span.end();
}
