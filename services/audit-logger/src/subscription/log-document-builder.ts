import {
	toCorrelationId,
	toEnvironment,
	toInstanceId,
	toServiceId,
	toSessionId,
	toUserId,
} from "@trading-model/common/domain/primitives";
import { HttpMethod } from "@trading-model/common/contracts/signed-request";
import type { z } from "zod";

import { LOGS_INGESTED_TOTAL } from "../config/metrics";
import type { ServiceLogDocument } from "../persistence/log-repository";
import type { LOG_ENTRY_SCHEMA } from "./log-schemas";

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
		name: toServiceId(entry.serviceName ?? "unknown"),
		instanceId: toInstanceId(entry.instanceId ?? "unknown"),
	};
}

function _buildDocUser(
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>
): ServiceLogDocument["user"] | undefined {
	if (!(entry.userId || entry.sessionId)) {
		return;
	}
	return {
		id: entry.userId ? toUserId(entry.userId) : undefined,
		sessionId: entry.sessionId ? toSessionId(entry.sessionId) : undefined,
	};
}

function _buildDocContext(
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>
): ServiceLogDocument["context"] {
	const context = entry.context ?? {};
	const hasErrorKeys = context.err || context.error;
	if (Object.keys(context).length === 0 || hasErrorKeys) {
		return;
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
		correlationId: entry.correlationId
			? toCorrelationId(entry.correlationId)
			: undefined,
		context: _buildDocContext(entry),
		error: extractError(entry),
		environment: entry.environment
			? toEnvironment(entry.environment)
			: undefined,
	};

	return _addOptionalFields(doc, entry);
}

function _addOptionalFields(doc: ServiceLogDocument, entry: z.infer<typeof LOG_ENTRY_SCHEMA>): ServiceLogDocument {
	if (entry.request) {
		doc.request = _buildDocRequest(entry);
	}
	const user = _buildDocUser(entry);
	if (user) {
		doc.user = user;
	}
	return doc;
}

function _buildDocRequest(entry: z.infer<typeof LOG_ENTRY_SCHEMA>): ServiceLogDocument["request"] {
	return {
		method: entry.request!.method as HttpMethod,
		url: entry.request!.url as never,
		statusCode: entry.request!.statusCode,
		durationMs: entry.request!.durationMs as never,
	};
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

export { _buildLogDocuments, buildLogDocument };
