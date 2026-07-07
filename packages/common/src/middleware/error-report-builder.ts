import type { Request } from "express";
import type { CorrelationId } from "../domain/primitives";
import { normalizeError } from "../utils/errors";
import type { ResolvedErrorTrackingConfig } from "./error-tracking-config";

export interface ErrorReportBody {
	message: string;
	stack?: string;
	url: string;
	method: string;
	statusCode: number;
	correlationId: string;
	timestamp: string;
	serviceName: string;
	serviceVersion: string;
	instanceId: string;
}

function _extractCorrelationId(req: Request): string {
	return (
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
		url: req.originalUrl ?? req.url,
		method: req.method,
		statusCode,
		correlationId: _extractCorrelationId(req),
		timestamp: new Date().toISOString(),
		serviceName: config.serviceName,
		serviceVersion: config.serviceVersion,
		instanceId: config.instanceId,
	};
}
