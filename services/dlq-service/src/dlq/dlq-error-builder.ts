import { SpanStatusCode } from "@opentelemetry/api";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "../config/logger";
import { isDlqCapacityError } from "./repository";

export function validationFail(
	span: import("@opentelemetry/api").Span,
	message: string,
	httpCode: number,
	extra?: Record<string, string>
): { valid: false; response: ResponseObject } {
	span.setStatus({ code: SpanStatusCode.ERROR, message });
	span.end();
	return {
		valid: false,
		response: sendResponse({ error: message, ...extra }, httpCode),
	};
}

export function handleAddEntryError(
	err: unknown,
	span: import("@opentelemetry/api").Span
): ResponseObject {
	if (isDlqCapacityError(err)) {
		return handleCapacityError(span);
	}
	return handleStorageError(err, span);
}

function handleCapacityError(
	span: import("@opentelemetry/api").Span
): ResponseObject {
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: "DLQ capacity limit reached",
	});
	span.end();
	return sendResponse(
		{ error: "DLQ capacity limit reached, entry rejected" },
		HTTP_STATUS.TOO_MANY_REQUESTS
	);
}

function handleStorageError(
	err: unknown,
	span: import("@opentelemetry/api").Span
): ResponseObject {
	logger.error("Failed to persist DLQ entry — storage error", {
		error: normalizeError(err).message,
	});
	span.recordException(err as Error);
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: (err as Error).message,
	});
	span.end();
	return sendResponse(
		{
			error: "Storage unavailable — message not persisted. Retry later.",
			code: "STORAGE_UNAVAILABLE",
		},
		HTTP_STATUS.SERVICE_UNAVAILABLE
	);
}
