import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { ResponseObject } from "@trading-model/http/adapters/inbound/response-exception";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import {
	type DlqEntry,
	dlqRepository,
	notifyAddAudit,
	pushToRedisQueue,
} from "../../config/dlq-adapters";
import { metrics } from "../../config/metrics";
import { handleAddEntryError } from "../../shared/dlq-error-builder";
import { checkEntryAcceptable } from "./dlq-validator";

type PostInsertStep = (id: string, data: DlqEntry) => Promise<void>;

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
		notifyAddAudit(id, data.topic, data.reason);
		return Promise.resolve();
	},
];

async function runPostInsertSteps(
	id: string,
	data: DlqEntry,
	span: Span
): Promise<void> {
	span.setAttribute("entryId", id);
	for (const step of postInsertSteps) {
		await step(id, data);
	}
}

export function addEntry(entry: DlqEntry): Promise<ResponseObject> {
	return tracer.startActiveSpan("dlq-add-entry", async (span) => {
		try {
			const check = checkEntryAcceptable(entry, span);
			if (!check.valid) {
				return check.response;
			}

			const id = await dlqRepository.insert(entry);
			await runPostInsertSteps(id, entry, span);

			span.setStatus({ code: SpanStatusCode.OK });
			span.end();
			return sendResponse({ id }, 201 as HttpStatusCode);
		} catch (err) {
			return handleAddEntryError(err, span);
		}
	});
}
