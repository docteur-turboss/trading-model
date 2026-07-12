import {
	toCorrelationId,
	toEnvironment,
	toInstanceId,
	toServiceId,
	toSessionId,
	toUserId,
} from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import type { HttpMethod } from "@trading-model/validation/contracts/signed-request";
import type { z } from "zod";

import { LOGS_INGESTED_TOTAL } from "../config/metrics";

const MS_PER_DAY = 86_400_000;

import type { ServiceLogDocument } from "../persistence/log-repository";
import { extractError } from "./error-extractor";
import type { LOG_ENTRY_SCHEMA } from "./log-schemas";

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
		ttl: new Date(Date.now() + ttlDays * MS_PER_DAY),
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

function _addOptionalFields(
	doc: ServiceLogDocument,
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>
): ServiceLogDocument {
	if (entry.request) {
		doc.request = _buildDocRequest(entry);
	}
	const user = _buildDocUser(entry);
	if (user) {
		doc.user = user;
	}
	return doc;
}

function _buildDocRequest(
	entry: z.infer<typeof LOG_ENTRY_SCHEMA>
): ServiceLogDocument["request"] {
	return {
		method: entry.request!.method as HttpMethod,
		url: entry.request!.url as never,
		statusCode: entry.request!.statusCode as HttpStatusCode | undefined,
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
