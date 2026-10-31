import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import { metrics } from "../../config/metrics";
import { notifyDeleteAudit } from "../outbound/audit-notifier";
import { dlqRepository } from "../outbound/repository";
import type { DeleteEntriesBody } from "./api-routes";

export async function deleteEntries({
	ids,
}: DeleteEntriesBody): Promise<ResponseObject> {
	const deleted = await dlqRepository.delete(ids);
	metrics.entriesDeleted.inc(deleted);
	notifyDeleteAudit(ids, deleted);
	return sendResponse({ deleted }, 200 as HttpStatusCode);
}
