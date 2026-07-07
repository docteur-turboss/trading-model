import { SpanStatusCode, type Span, trace } from "@opentelemetry/api";
import type { ResponseObject } from "@trading-model/common/middleware/response-exception";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { z } from "zod";
import { metrics } from "../config/metrics";
import { notifyAddAudit } from "./audit-notifier";
import { handleAddEntryError } from "./dlq-error-builder";
import { pushToRedisQueue } from "./dlq-redis-pusher";
import type { DlqEntrySchema } from "./dlq-schemas";
import { validateAddEntryBody } from "./dlq-validator";
import { dlqRepository } from "./repository";

type ValidatedData = z.infer<typeof DlqEntrySchema>;
type PostInsertStep = (id: string, data: ValidatedData) => Promise<void>;

const tracer = trace.getTracer("dlq-service");

const postInsertSteps: PostInsertStep[] = [
	async (id) => {
		metrics.entriesAdded.inc(1);
	},
	async (id) => {
		await pushToRedisQueue(id);
	},
	async (id, data) => {
		notifyAddAudit(id, data.topic, data.reason);
	},
];

async function runPostInsertSteps(
	id: string,
	data: ValidatedData,
	span: Span
): Promise<void> {
	span.setAttribute("entryId", id);
	for (const step of postInsertSteps) {
		await step(id, data);
	}
}

export async function addEntry(req: {
	body: unknown;
}): Promise<ResponseObject> {
	return tracer.startActiveSpan("dlq-add-entry", async (span) => {
		try {
			const validation = validateAddEntryBody(req.body, span);
			if (!validation.valid) {
				return validation.response;
			}

			const id = await dlqRepository.insert(validation.data);
			await runPostInsertSteps(id, validation.data, span);

			span.setStatus({ code: SpanStatusCode.OK });
			span.end();
			return sendResponse({ id }, 201);
		} catch (err) {
			return handleAddEntryError(err, span);
		}
	});
}
