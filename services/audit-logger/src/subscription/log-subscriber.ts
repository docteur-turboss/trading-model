import { logger } from "@trading-model/common/config/logger";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { normalizeError } from "@trading-model/common/utils/errors";

import { ENV } from "../config/env";
import { LOGS_STORED_TOTAL } from "../config/metrics";
import type {
	LogRepository,
	ServiceLogDocument,
} from "../persistence/log-repository";
import { _buildLogDocuments } from "./log-document-builder";
import { LOGS_BATCH_SCHEMA } from "./log-schemas";

async function _storeLogs(
	logRepo: LogRepository,
	docs: ServiceLogDocument[]
): Promise<ResponseObject> {
	try {
		await logRepo.insertBatch(docs);
		LOGS_STORED_TOTAL.inc({ status: "success" }, docs.length);
		return sendResponse({ stored: docs.length }, 200 as HttpStatusCode);
	} catch (err) {
		logger.error("Failed to store service logs", {
			context: {
				error: normalizeError(err),
			},
		});
		LOGS_STORED_TOTAL.inc({ status: "error" }, docs.length);
		return sendResponse(
			{ error: "Storage unavailable" },
			503 as HttpStatusCode
		);
	}
}

export function createLogHandler(logRepo: LogRepository) {
	return catchSync((req) => {
		const parsed = LOGS_BATCH_SCHEMA.safeParse(req.body);
		if (!parsed.success) {
			return sendResponse(
				{ error: parsed.error.message },
				400 as HttpStatusCode
			);
		}

		const receivedAt = new Date();
		const ttlDays = ENV.LOG_RETENTION_DAYS ?? 1827;
		const docs = _buildLogDocuments(parsed.data.logs, receivedAt, ttlDays);

		return _storeLogs(logRepo, docs);
	});
}
