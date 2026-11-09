import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import type {
	ReplayRequest,
	ReplayResult,
} from "../../application/use-cases/dlq-replay-service";
import type { ReplayEntriesQuery } from "./api-routes";

const tracer = trace.getTracer(ServiceInstanceName.DlqService);

function _toResponse(result: ReplayResult): ResponseObject {
	switch (result.status) {
		case "message-manager-unresolved":
			return sendResponse(
				{
					error:
						"Cannot resolve message-manager URL (no env var, no address-manager)",
				},
				HTTP_STATUS.INTERNAL_SERVER_ERROR
			);
		case "no-entries":
			return sendResponse(
				{ replayed: 0, message: "No entries available for retry" },
				HTTP_STATUS.OK
			);
		default:
			return sendResponse(result.details, HTTP_STATUS.OK);
	}
}

export function createReplayEntries(
	replay: (
		request: ReplayRequest,
		span: import("@opentelemetry/api").Span
	) => Promise<ReplayResult>
): (query: ReplayEntriesQuery) => Promise<ResponseObject> {
	return (query) =>
		tracer.startActiveSpan("dlq-replay-entries", async (span) => {
			try {
				return _toResponse(await replay(query, span));
			} catch (err) {
				span.recordException(err as Error);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: (err as Error).message,
				});
				throw err;
			} finally {
				span.end();
			}
		});
}
