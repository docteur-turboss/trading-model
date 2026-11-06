import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ResponseObject } from "@trading-model/http/adapters/inbound/response-exception";
import type { Bytes } from "@trading-model/primitives/primitives";
import { isDbConnected } from "../../config/db";
import {
	STORAGE_UNAVAILABLE,
	validationFail,
} from "../../shared/dlq-error-builder";
import type { DlqEntry } from "../outbound/repository";

const MAX_MESSAGE_BYTES = (5 * 1024 * 1024) as Bytes;

/**
 * What the route schema cannot check: the 5 MB payload limit and a storage
 * able to take the entry. The entry itself is parsed by the route (DLQ_API).
 */
export function checkEntryAcceptable(
	entry: DlqEntry,
	span: import("@opentelemetry/api").Span
): { valid: false; response: ResponseObject } | { valid: true } {
	span.setAttribute("topic", entry.topic ?? "");
	span.setAttribute("reason", entry.reason ?? "");

	return (
		_checkMessageSize(entry.message, span) ??
		_checkDbAvailable(span) ?? { valid: true }
	);
}

function _checkMessageSize(
	message: unknown,
	span: import("@opentelemetry/api").Span
): { valid: false; response: ResponseObject } | null {
	const messageStr = JSON.stringify(message);
	const msgSize = Buffer.byteLength(messageStr);
	if (msgSize > MAX_MESSAGE_BYTES) {
		return validationFail(
			span,
			"Message payload exceeds maximum size of 5MB",
			HTTP_STATUS.BAD_REQUEST
		);
	}
	return null;
}

function _checkDbAvailable(
	span: import("@opentelemetry/api").Span
): { valid: false; response: ResponseObject } | null {
	if (!isDbConnected()) {
		return validationFail(
			span,
			STORAGE_UNAVAILABLE.error,
			HTTP_STATUS.SERVICE_UNAVAILABLE,
			{ code: STORAGE_UNAVAILABLE.code }
		);
	}
	return null;
}
