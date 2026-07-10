import type { Request } from "express";
import type {
	CorrelationId,
	InstanceId,
	ISODateTime,
	ServiceId,
	URLString,
	Version,
} from "../domain/primitives";
import {
	toCorrelationId,
	toInstanceId,
	toISODateTime,
	toServiceId,
	toVersion,
} from "../domain/primitives";
import { normalizeError } from "../utils/errors";
import type { ResolvedErrorTrackingConfig } from "./error-tracking-config";

export interface ErrorReportBody {
	message: string;
	stack?: string;
	url: URLString;
	method: string;
	statusCode: number;
	correlationId: CorrelationId;
	timestamp: ISODateTime;
	serviceName: ServiceId;
	serviceVersion: Version;
	instanceId: InstanceId;
}

function _extractCorrelationId(req: Request): CorrelationId {
	return toCorrelationId(
		(req as unknown as { correlationId?: CorrelationId }).correlationId ?? ""
	);
}

export function buildErrorReport(
	err: unknown,
	req: Request,
	statusCode: number,
	config: ResolvedErrorTrackingConfig
): ErrorReportBody {
	const normalized = normalizeError(err);
	return {
		message: normalized.message,
		stack: normalized.stack,
		url: (req.originalUrl ?? req.url) as URLString,
		method: req.method,
		statusCode,
		correlationId: _extractCorrelationId(req),
		timestamp: toISODateTime(new Date().toISOString()),
		serviceName: toServiceId(config.serviceName),
		serviceVersion: toVersion(config.serviceVersion),
		instanceId: toInstanceId(config.instanceId),
	};
}
