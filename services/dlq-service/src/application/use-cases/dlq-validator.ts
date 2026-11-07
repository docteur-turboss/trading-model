import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import { CryptoAlg } from "@trading-model/crypto/domain/constants/crypto-constants";
import type { ResponseObject } from "@trading-model/http/adapters/inbound/response-exception";
import type { Bytes } from "@trading-model/primitives/primitives";
import { isDbConnected } from "../../config/db";
import type { DlqEntry } from "../../config/dlq-adapters";
import { validationFail } from "../../shared/dlq-error-builder";

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
	const msgSize = Buffer.byteLength(messageStr, CryptoAlg.UTF8);
	if (msgSize > MAX_MESSAGE_BYTES) {
		return validationFail(
			span,
			"Message payload exceeds maximum size of 5MB",

			400 as HttpStatusCode
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
			"Storage unavailable — message not persisted. Retry later.",
			503 as HttpStatusCode,
			{ code: "STORAGE_UNAVAILABLE" }
		);
	}
	return null;
}
