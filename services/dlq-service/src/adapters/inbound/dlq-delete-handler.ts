import type { HttpStatusCode } from "@trading-model/common/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { metrics } from "../../config/metrics";
import { DeleteSchema } from "../../shared/dlq-schemas";
import { notifyDeleteAudit } from "../outbound/audit-notifier";
import { dlqRepository } from "../outbound/repository";

export async function deleteEntries(req: {
	body: unknown;
}): Promise<ResponseObject> {
	const parsed = DeleteSchema.safeParse(req.body);
	if (!parsed.success) {
		return sendResponse({ error: parsed.error.message }, 400 as HttpStatusCode);
	}

	const deleted = await dlqRepository.delete(parsed.data.ids);
	metrics.entriesDeleted.inc(deleted);
	notifyDeleteAudit(parsed.data.ids, deleted);
	return sendResponse({ deleted }, 200 as HttpStatusCode);
}
