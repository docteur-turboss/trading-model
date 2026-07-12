import { SpanStatusCode } from "@opentelemetry/api";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";
import type { z } from "zod";
import { isDbConnected } from "../config/db";
import { DlqEntrySchema } from "./dlq-schemas";

const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;

export function validateAddEntryBody(
	body: unknown,
	span: import("@opentelemetry/api").Span
):
	| { valid: false; response: ResponseObject }
	| { valid: true; data: z.infer<typeof DlqEntrySchema> } {
	const parsed = DlqEntrySchema.safeParse(body);
	if (!parsed.success) {
		return _validationFail(span, parsed.error.message, 400);
	}

	span.setAttribute("topic", parsed.data.topic ?? "");
	span.setAttribute("reason", parsed.data.reason ?? "");

	const sizeFail = _checkMessageSize(parsed.data.message, span);
	if (sizeFail) {
		return sizeFail;
	}

	const dbFail = _checkDbAvailable(span);
	if (dbFail) {
		return dbFail;
	}

	return { valid: true, data: parsed.data };
}

function _checkMessageSize(
	message: unknown,
	span: import("@opentelemetry/api").Span
): { valid: false; response: ResponseObject } | null {
	const messageStr = JSON.stringify(message);
	const msgSize = Buffer.byteLength(messageStr, CryptoAlg.UTF8);
	if (msgSize > MAX_MESSAGE_BYTES) {
		return _validationFail(
			span,
			"Message payload exceeds maximum size of 5MB",
			400
		);
	}
	return null;
}

function _checkDbAvailable(
	span: import("@opentelemetry/api").Span
): { valid: false; response: ResponseObject } | null {
	if (!isDbConnected()) {
		return _validationFail(
			span,
			"Storage unavailable — message not persisted. Retry later.",
			503,
			{ code: "STORAGE_UNAVAILABLE" }
		);
	}
	return null;
}

function _validationFail(
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
