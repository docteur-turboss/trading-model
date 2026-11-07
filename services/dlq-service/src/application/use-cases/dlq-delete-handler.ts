import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import type { DeleteEntriesBody } from "../../config/dlq-adapters";
import { dlqRepository, notifyDeleteAudit } from "../../config/dlq-adapters";
import { metrics } from "../../config/metrics";

export async function deleteEntries({
	ids,
}: DeleteEntriesBody): Promise<ResponseObject> {
	const deleted = await dlqRepository.delete(ids);
	metrics.entriesDeleted.inc(deleted);
	notifyDeleteAudit(ids, deleted);
	return sendResponse({ deleted }, 200 as HttpStatusCode);
}
