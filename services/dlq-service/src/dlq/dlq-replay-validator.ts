import { SpanStatusCode } from "@opentelemetry/api";
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
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: parsed.error.message,
		});
		span.end();
		return {
			valid: false,
			response: sendResponse({ error: parsed.error.message }, 400),
		};
	}
	span.setAttribute("topic", parsed.data.topic ?? "all");
	span.setAttribute("limit", parsed.data.limit);
	return { valid: true, data: parsed.data };
}
