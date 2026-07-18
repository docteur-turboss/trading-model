import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { executeReplayPipeline } from "./replay-pipeline";

const tracer = trace.getTracer(ServiceInstanceName.DlqService);

export function replayEntries(req: {
	query: unknown;
}): Promise<ResponseObject> {
	return tracer.startActiveSpan("dlq-replay-entries", async (span) => {
		try {
			return await executeReplayPipeline(req.query, span);
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
