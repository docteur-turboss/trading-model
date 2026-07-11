import type { Request } from "express";
import {
	type CorrelationId,
	type InstanceId,
	type ISODateTime,
	type ServiceId,
	toCorrelationId,
	toInstanceId,
	toISODateTime,
	toServiceId,
	toVersion,
	URLString,
	type Version,
} from "../domain/primitives";
import type { HttpStatusCode } from "../http-status";
import { normalizeError } from "../utils/errors";
import type { ResolvedErrorTrackingConfig } from "./error-tracking-config";

export interface ErrorReportBody {
	message: string;
	stack?: string;
	url: URLString;
	method: string;
	statusCode: HttpStatusCode;
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
	statusCode: HttpStatusCode,
	config: ResolvedErrorTrackingConfig
): ErrorReportBody {
	const normalized = normalizeError(err);
	return {
		message: normalized.message,
		stack: normalized.stack,
		url: URLString.of(req.originalUrl ?? req.url),
		method: req.method,
		statusCode,
		correlationId: _extractCorrelationId(req),
		timestamp: toISODateTime(new Date().toISOString()),
		serviceName: toServiceId(config.serviceName),
		serviceVersion: toVersion(config.serviceVersion),
		instanceId: toInstanceId(config.instanceId),
	};
}
