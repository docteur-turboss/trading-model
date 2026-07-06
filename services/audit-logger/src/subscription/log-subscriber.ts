import { logger } from "@trading-model/common/config/logger";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import { normalizeError } from "@trading-model/common/utils/errors";
import { z } from "zod";

import { ENV } from "../config/env";
import { LOGS_INGESTED_TOTAL, LOGS_STORED_TOTAL } from "../config/metrics";
import type {
	LogRepository,
	ServiceLogDocument,
} from "../persistence/log-repository";

const LOG_ENTRY_SCHEMA = z.object({
	level: z.enum(["debug", "info", "warn", "error"]),
	message: z.string(),
	context: z.record(z.string(), z.unknown()).optional(),
	serviceName: z.string().optional(),
	instanceId: z.string().optional(),
	module: z.string().optional(),
	correlationId: z.string().optional(),
	environment: z.string().optional(),
	userId: z.string().nullable().optional(),
	sessionId: z.string().nullable().optional(),
	error: z
		.object({
			name: z.string().optional(),
			message: z.string().optional(),
			stack: z.string().optional(),
			code: z.string().optional(),
		})
		.optional(),
	request: z
		.object({
			method: z.string().optional(),
			url: z.string().optional(),
			statusCode: z.number().optional(),
			durationMs: z.number().optional(),
		})
		.optional(),
	timestamp: z.string().optional(),
});

const LOGS_BATCH_SCHEMA = z.object({
	logs: z.array(LOG_ENTRY_SCHEMA).min(1).max(1000),
});

function extractError(
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>
):
	| { name: string; message: string; stack?: string; code?: string }
	| undefined {
	const context = entry.context ?? {};

	if (entry.error) {
		return {
			name: entry.error.name ?? "Error",
			message: entry.error.message ?? "Unknown error",
			stack: entry.error.stack,
			code: entry.error.code,
		};
	}

	const ctxErr = context.err as Error | undefined;
	const ctxError = context.error as Error | undefined;
	if (ctxErr || ctxError) {
		return {
			name: ctxErr?.name ?? ctxError?.name ?? "Error",
			message: ctxErr?.message ?? ctxError?.message ?? "Unknown error",
			stack: ctxErr?.stack ?? ctxError?.stack,
		};
	}
}

function _buildDocService(
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>
): ServiceLogDocument["service"] {
	return {
		name: entry.serviceName ?? "unknown",
		instanceId: entry.instanceId ?? "unknown",
	};
}

function _buildDocUser(
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>
): ServiceLogDocument["user"] | undefined {
	if (!entry.userId && !entry.sessionId) {
		return undefined;
	}
	return {
		id: entry.userId ?? undefined,
		sessionId: entry.sessionId ?? undefined,
	};
}

function _buildDocContext(
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>
): ServiceLogDocument["context"] {
	const context = entry.context ?? {};
	const hasErrorKeys = context.err || context.error;
	if (Object.keys(context).length === 0 || hasErrorKeys) {
		return undefined;
	}
	return context;
}

function buildLogDocument(
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>,
	receivedAt: Date,
	ttlDays: number
): ServiceLogDocument {
	const doc: ServiceLogDocument = {
		receivedAt,
		ttl: new Date(Date.now() + ttlDays * 86400_000),
		level: entry.level,
		message: entry.message,
		service: _buildDocService(entry),
		module: entry.module,
		correlationId: entry.correlationId,
		context: _buildDocContext(entry),
		error: extractError(entry),
		environment: entry.environment,
	};

	if (entry.request) {
		doc.request = entry.request;
	}
	const user = _buildDocUser(entry);
	if (user) {
		doc.user = user;
	}

	return doc;
}

function _buildLogDocuments(
	entries: z.infer<typeof LOG_ENTRY_SCHEMA>[],
	receivedAt: Date,
	ttlDays: number
): ServiceLogDocument[] {
	const docs: ServiceLogDocument[] = [];
	for (const entry of entries) {
		const doc = buildLogDocument(entry, receivedAt, ttlDays);
		LOGS_INGESTED_TOTAL.inc({
			level: entry.level,
			service_name: entry.serviceName ?? "unknown",
		});
		docs.push(doc);
	}
	return docs;
}

async function _storeLogs(
	logRepo: LogRepository,
	docs: ServiceLogDocument[]
): Promise<import("@trading-model/common/middleware/response-exception").ResponseObject> {
	try {
		await logRepo.insertBatch(docs);
		LOGS_STORED_TOTAL.inc({ status: "success" }, docs.length);
		return sendResponse({ stored: docs.length }, 200);
	} catch (err) {
		logger.error("Failed to store service logs", { context: {
			error: normalizeError(err),
		} });
		LOGS_STORED_TOTAL.inc({ status: "error" }, docs.length);
		return sendResponse({ error: "Storage unavailable" }, 503);
	}
}

export function createLogHandler(logRepo: LogRepository) {
	return catchSync(async (req) => {
		const parsed = LOGS_BATCH_SCHEMA.safeParse(req.body);
		if (!parsed.success) {
			return sendResponse({ error: parsed.error.message }, 400);
		}

		const receivedAt = new Date();
		const ttlDays = ENV.LOG_RETENTION_DAYS ?? 1827;
		const docs = _buildLogDocuments(parsed.data.logs, receivedAt, ttlDays);

		return _storeLogs(logRepo, docs);
	});
}
