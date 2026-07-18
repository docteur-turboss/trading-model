import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { metrics } from "../config/metrics";
import { notifyDeleteAudit } from "./audit-notifier";
import { DeleteSchema } from "./dlq-schemas";
import { dlqRepository } from "./repository";

export async function deleteEntries(req: {
	body: unknown;
}): Promise<ResponseObject> {
	const parsed = DeleteSchema.safeParse(req.body);
	if (!parsed.success) {
		return sendResponse({ error: parsed.error.message }, 400);
	}

	const deleted = await dlqRepository.delete(parsed.data.ids);
	metrics.entriesDeleted.inc(deleted);
	notifyDeleteAudit(parsed.data.ids, deleted);
	return sendResponse({ deleted }, 200);
}
