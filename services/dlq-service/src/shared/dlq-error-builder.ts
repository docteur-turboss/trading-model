import { SpanStatusCode } from "@opentelemetry/api";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import { isDlqCapacityError } from "../adapters/outbound/repository";
import { logger } from "../config/logger";

export const STORAGE_UNAVAILABLE = {
	error: "Storage unavailable — message not persisted. Retry later.",
	code: "STORAGE_UNAVAILABLE",
} as const;

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
		response: sendResponse(
			{ error: message, ...extra },
			httpCode as HttpStatusCode
		),
	};
}

export function handleAddEntryError(
	err: unknown,
	span: import("@opentelemetry/api").Span
): ResponseObject {
	if (isDlqCapacityError(err)) {
		return validationFail(
			span,
			"DLQ capacity limit reached",
			HTTP_STATUS.TOO_MANY_REQUESTS,
			{ error: "DLQ capacity limit reached, entry rejected" }
		).response;
	}
	return handleStorageError(err, span);
}

function handleStorageError(
	err: unknown,
	span: import("@opentelemetry/api").Span
): ResponseObject {
	_logStorageError(err);
	_spanError(span, err);
	return sendResponse(STORAGE_UNAVAILABLE, HTTP_STATUS.SERVICE_UNAVAILABLE);
}

function _logStorageError(err: unknown): void {
	logger.error("Failed to persist DLQ entry — storage error", {
		error: normalizeError(err).message,
	});
}

function _spanError(
	span: import("@opentelemetry/api").Span,
	err: unknown
): void {
	span.recordException(err as Error);
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: (err as Error).message,
	});
	span.end();
}
