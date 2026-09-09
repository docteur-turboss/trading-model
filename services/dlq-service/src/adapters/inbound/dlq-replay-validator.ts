import { SpanStatusCode } from "@opentelemetry/api";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { z } from "zod";

const ReplaySchema = z.object({
	topic: z.string().optional(),
	limit: z.coerce.number().int().positive().max(100).default(50),
	batchId: z.string().optional(),
});

export function validateReplayQuery(
	query: unknown,
	span: import("@opentelemetry/api").Span
):
	| { valid: false; response: ResponseObject }
	| { valid: true; data: z.infer<typeof ReplaySchema> } {
	const parsed = ReplaySchema.safeParse(query);
	if (!parsed.success) {
		return _replayValidationFail(span, parsed.error.message);
	}
	span.setAttribute("topic", parsed.data.topic ?? "all");
	span.setAttribute("limit", parsed.data.limit);
	return { valid: true, data: parsed.data };
}

function _replayValidationFail(
	span: import("@opentelemetry/api").Span,
	message: string
): { valid: false; response: ResponseObject } {
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message,
	});
	span.end();
	return {
		valid: false,
		response: sendResponse({ error: message }, 400 as HttpStatusCode),
	};
}
