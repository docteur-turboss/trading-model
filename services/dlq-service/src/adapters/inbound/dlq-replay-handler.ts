import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ResponseObject } from "@trading-model/http/adapters/inbound/response-exception";
import type { ReplayEntriesQuery } from "./api-routes";
import { executeReplayPipeline } from "./dlq-replay-service";

const tracer = trace.getTracer(ServiceInstanceName.DlqService);

export function replayEntries(
	query: ReplayEntriesQuery
): Promise<ResponseObject> {
	return tracer.startActiveSpan("dlq-replay-entries", async (span) => {
		try {
			return await executeReplayPipeline(query, span);
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
