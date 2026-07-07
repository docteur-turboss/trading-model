import type { NextFunction, Request, Response } from "express";

import { logger } from "../config/logger";
import type { CorrelationId, InstanceId, Version } from "../domain/primitives";
import { normalizeError } from "../utils/errors";
import { TimerHandle } from "../utils/timer-handle";
import { ErrorBuffer } from "./error-buffer";

const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 50;

interface ErrorTrackingConfig {
	endpoint?: string;
	serviceName?: string;
	serviceVersion?: Version;
	instanceId?: InstanceId;
	flushIntervalMs?: number;
	batchSize?: number;
}

let config: Required<ErrorTrackingConfig> = {
	endpoint: "",
	serviceName: "unknown",
	serviceVersion: "0.0.0" as Version,
	instanceId: "unknown" as InstanceId,
	flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
	batchSize: DEFAULT_BATCH_SIZE,
};

let errorBuffer: ErrorBuffer | null = null;
const flushTimer = new TimerHandle();

export function configureErrorTracking(opts: ErrorTrackingConfig): void {
	config = _buildConfig(opts);
	if (config.endpoint) {
		errorBuffer = new ErrorBuffer(
			config.endpoint,
			config.batchSize,
			config.serviceName,
			config.instanceId
		);
		startFlushTimer();
		logger.info("Error tracking configured", {
			context: { endpoint: config.endpoint, service: config.serviceName },
		});
	}
}

function _buildConfig(
	opts: ErrorTrackingConfig
): Required<ErrorTrackingConfig> {
	return {
		endpoint: opts.endpoint ?? process.env.ERROR_URL_WEBHOOK ?? "",
		serviceName: opts.serviceName ?? process.env.APP_NAME ?? "unknown",
		serviceVersion:
			opts.serviceVersion ?? ((process.env.APP_VERSION ?? "0.0.0") as Version),
		instanceId:
			opts.instanceId ?? ((process.env.INSTANCE_ID ?? "unknown") as InstanceId),
		flushIntervalMs: opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
		batchSize: opts.batchSize ?? DEFAULT_BATCH_SIZE,
	};
}

function startFlushTimer(): void {
	if (flushTimer.isRunning) {
		return;
	}
	flushTimer.startInterval(() => errorBuffer?.flush(), config.flushIntervalMs);
	flushTimer.unref();
}

function stopFlushTimer(): void {
	flushTimer.stop();
}

function _buildErrorReport(
	err: unknown,
	req: Request,
	statusCode: number
): {
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
} {
	const normalized = normalizeError(err);
	return {
		message: normalized.message,
		stack: normalized.stack,
		url: req.originalUrl ?? req.url,
		method: req.method,
		statusCode,
		correlationId:
			(req as unknown as { correlationId?: CorrelationId }).correlationId ??
			"",
		timestamp: new Date().toISOString(),
		serviceName: config.serviceName,
		serviceVersion: config.serviceVersion,
		instanceId: config.instanceId,
	};
}

export function reportError(
	err: unknown,
	req: Request,
	statusCode: number
): void {
	if (!errorBuffer) {
		return;
	}
	const report = _buildErrorReport(err, req, statusCode);
	errorBuffer.add(report);
}

export function errorTrackingMiddleware(
	endpoint?: string
): (err: Error, req: Request, res: Response, next: NextFunction) => void {
	if (endpoint) {
		configureErrorTracking({
			endpoint: endpoint || process.env.ERROR_URL_WEBHOOK,
		});
	}
	return (
		err: Error,
		req: Request,
		res: Response,
		next: NextFunction
	): void => {
		const statusCode = res.statusCode >= 400 ? res.statusCode : 500;
		if (statusCode >= 500) {
			reportError(err, req, statusCode);
		}
		next(err);
	};
}

export function shutdownErrorTracking(): void {
	stopFlushTimer();
	if (errorBuffer && errorBuffer.pendingCount > 0) {
		void errorBuffer.flush();
	}
}
