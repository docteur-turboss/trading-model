import { SpanStatusCode } from "@opentelemetry/api";
import type { URLString } from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { resolveMessageManagerUrl } from "../dlq/shared/message-manager-resolver";

export async function resolveMMUrlOrFail(
	span: import("@opentelemetry/api").Span
): Promise<URLString | null> {
	const messageManagerUrl = await resolveMessageManagerUrl();
	if (!messageManagerUrl) {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: "Cannot resolve message-manager URL",
		});
		span.end();
		return null;
	}
	return messageManagerUrl;
}

export function mmResolveError(): ResponseObject {
	return sendResponse(
		{
			error:
				"Cannot resolve message-manager URL (no env var, no address-manager)",
		},
		500 as HttpStatusCode
	);
}
