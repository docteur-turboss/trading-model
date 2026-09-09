import type { Bytes } from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import type { ResponseObject } from "@trading-model/common/middleware/response-exception";
import { CryptoAlg } from "@trading-model/crypto/domain/constants/crypto-constants";
import type { z } from "zod";
import { isDbConnected } from "../../config/db";
import { validationFail } from "../../shared/dlq-error-builder";
import { DlqEntrySchema } from "../../shared/dlq-schemas";

const MAX_MESSAGE_BYTES = (5 * 1024 * 1024) as Bytes;

export function validateAddEntryBody(
	body: unknown,
	span: import("@opentelemetry/api").Span
):
	| { valid: false; response: ResponseObject }
	| { valid: true; data: z.infer<typeof DlqEntrySchema> } {
	const parsed = DlqEntrySchema.safeParse(body);
	if (!parsed.success) {
		return validationFail(span, parsed.error.message, 400 as HttpStatusCode);
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
