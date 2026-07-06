import { SpanStatusCode } from "@opentelemetry/api";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { normalizeError } from "@trading-model/common/utils/errors";
import { z } from "zod";
import { isDbConnected } from "../config/db";
import { logger } from "../config/logger";
import { dlqRedisQueue } from "../config/redis-queue";
import { isDlqCapacityError } from "./repository";

const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;

const DlqEntrySchema = z.object({
	topic: z.string().optional(),
	message: z.unknown(),
	reason: z.string().optional(),
	deliveryAttempt: z.number().int(),
	timestamp: z.string(),
	messageId: z.string().optional(),
});

const DeleteSchema = z.object({
	ids: z.array(z.string()).min(1).max(1000),
});

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

function validateAddEntryBody(
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

	const messageStr = JSON.stringify(parsed.data.message);
	const msgSize = Buffer.byteLength(messageStr, "utf8");
	if (msgSize > MAX_MESSAGE_BYTES) {
		return _validationFail(
			span,
			"Message payload exceeds maximum size of 5MB",
			400
		);
	}

	if (!isDbConnected()) {
		return _validationFail(
			span,
			"Storage unavailable — message not persisted. Retry later.",
			503,
			{ code: "STORAGE_UNAVAILABLE" }
		);
	}

	return { valid: true, data: parsed.data };
}

function handleAddEntryError(
	err: unknown,
	span: import("@opentelemetry/api").Span
): ResponseObject {
	if (isDlqCapacityError(err)) {
		return _handleCapacityError(span);
	}
	return _handleStorageError(err, span);
}

function _handleCapacityError(
	span: import("@opentelemetry/api").Span
): ResponseObject {
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: "DLQ capacity limit reached",
	});
	span.end();
	return sendResponse(
		{ error: "DLQ capacity limit reached, entry rejected" },
		429
	);
}

function _handleStorageError(
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
		503
	);
}

async function pushToRedisQueue(id: string): Promise<void> {
	try {
		await Promise.race([dlqRedisQueue.push(id), _redisPushTimeout()]);
	} catch (err) {
		_logRedisPushError(id, err);
	}
}

function _redisPushTimeout(): Promise<void> {
	return new Promise<void>((_, reject) => {
		const timer = setTimeout(
			() => reject(new Error("Redis push timeout")),
			2000
		);
		timer.unref();
	});
}

function _logRedisPushError(entryId: string, err: unknown): void {
	logger.warn("Failed to push entry to Redis queue", {
		entryId,
		error: (err as Error)?.message,
	});
}

export {
	DeleteSchema,
	DlqEntrySchema,
	handleAddEntryError,
	pushToRedisQueue,
	validateAddEntryBody,
};
