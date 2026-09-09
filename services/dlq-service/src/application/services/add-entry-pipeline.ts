import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toTopic } from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import type { ResponseObject } from "@trading-model/common/middleware/response-exception";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { z } from "zod";
import { validateAddEntryBody } from "../../adapters/inbound/dlq-validator";
import { notifyAddAudit } from "../../adapters/outbound/audit-notifier";
import { pushToRedisQueue } from "../../adapters/outbound/dlq-redis-pusher";
import {
	type DlqEntry,
	dlqRepository,
} from "../../adapters/outbound/repository";
import { metrics } from "../../config/metrics";
import { handleAddEntryError } from "../../shared/dlq-error-builder";
import type { DlqEntrySchema } from "../../shared/dlq-schemas";

type ValidatedData = z.infer<typeof DlqEntrySchema>;
type PostInsertStep = (id: string, data: ValidatedData) => Promise<void>;

const tracer = trace.getTracer(ServiceInstanceName.DlqService);

const postInsertSteps: PostInsertStep[] = [
	(_id) => {
		metrics.entriesAdded.inc(1);
		return Promise.resolve();
	},
	async (id) => {
		await pushToRedisQueue(id);
	},
	(id, data) => {
		notifyAddAudit(
			id,
			data.topic ? toTopic(data.topic) : undefined,
			data.reason
		);
		return Promise.resolve();
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

export function addEntry(req: { body: unknown }): Promise<ResponseObject> {
	return tracer.startActiveSpan("dlq-add-entry", async (span) => {
		try {
			const validation = validateAddEntryBody(req.body, span);
			if (!validation.valid) {
				return validation.response;
			}

			const id = await dlqRepository.insert(
				validation.data as unknown as DlqEntry
			);
			await runPostInsertSteps(id, validation.data, span);

			span.setStatus({ code: SpanStatusCode.OK });
			span.end();
			return sendResponse({ id }, 201 as HttpStatusCode);
		} catch (err) {
			return handleAddEntryError(err, span);
		}
	});
}
