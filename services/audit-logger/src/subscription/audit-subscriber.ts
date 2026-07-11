import type { HttpStatusCode } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { RequestHandler } from "express";
import type { AuditRepository } from "../persistence/audit-repository";
import { buildAuditDocument } from "./audit-document-builder";
import { parseEnvelope } from "./message-parser";

export function createMessageHandler(
	auditRepo: AuditRepository
): RequestHandler {
	const handler: RequestHandler = catchSync(async (req) => {
		const parsed = parseEnvelope(req.body as Record<string, unknown>);
		if (!parsed) {
			return sendResponse(
				{ error: "Invalid message format: no topic" },
				400 as HttpStatusCode
			);
		}

		const document = buildAuditDocument(parsed);
		await auditRepo.insert(document);

		return sendResponse({ status: "recorded" }, 200 as HttpStatusCode);
	});

	return handler;
}
