import type { Span } from "@opentelemetry/api";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
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
			// Replayed but not in the audit trail: no silent success (ADR-0059).
			return result.auditRecorded
				? sendResponse(result.details, HTTP_STATUS.OK)
				: sendResponse(
						{ ...result.details, auditRecorded: false },
						HTTP_STATUS.BAD_GATEWAY
					);
	}
}

export function createReplayEntries(
	replay: (request: ReplayRequest, span: Span) => Promise<ReplayResult>
): (
	query: ReplayEntriesQuery,
	actor: string | null
) => Promise<ResponseObject> {
	return (query, actor) =>
		tracer.startActiveSpan("dlq-replay-entries", async (span) => {
			try {
				return _toResponse(await replay({ ...query, actor }, span));
			} catch (err) {
				span.recordException(normalizeError(err));
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: normalizeError(err).message,
				});
				throw err;
			} finally {
				span.end();
			}
		});
}
