import type { NextFunction, Request, Response } from "express";

import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";

const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 50;

interface ErrorReport {
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

interface ErrorTrackingConfig {
	endpoint?: string;
	serviceName?: string;
	serviceVersion?: string;
	instanceId?: string;
	flushIntervalMs?: number;
	batchSize?: number;
}

let config: Required<ErrorTrackingConfig> = {
	endpoint: "",
	serviceName: "unknown",
	serviceVersion: "0.0.0",
	instanceId: "unknown",
	flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
	batchSize: DEFAULT_BATCH_SIZE,
};

const BUFFER: ErrorReport[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

export function configureErrorTracking(opts: ErrorTrackingConfig): void {
	config = _buildConfig(opts);
	if (config.endpoint) {
		startFlushTimer();
		logger.info("Error tracking configured", {
			context: { endpoint: config.endpoint, service: config.serviceName },
		});
	}
}

function _buildConfig(opts: ErrorTrackingConfig): Required<ErrorTrackingConfig> {
	return {
		endpoint: opts.endpoint ?? process.env.ERROR_URL_WEBHOOK ?? "",
		serviceName: opts.serviceName ?? process.env.APP_NAME ?? "unknown",
		serviceVersion: opts.serviceVersion ?? process.env.APP_VERSION ?? "0.0.0",
		instanceId: opts.instanceId ?? process.env.INSTANCE_ID ?? "unknown",
		flushIntervalMs: opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
		batchSize: opts.batchSize ?? DEFAULT_BATCH_SIZE,
	};
}

function startFlushTimer(): void {
	if (flushTimer) {
		return;
	}
	flushTimer = setInterval(() => flush(), config.flushIntervalMs);
	flushTimer.unref();
}

function stopFlushTimer(): void {
	if (flushTimer) {
		clearInterval(flushTimer);
		flushTimer = null;
	}
}

async function flush(): Promise<void> {
	if (BUFFER.length === 0) {
		return;
	}
	const batch = BUFFER.splice(0, config.batchSize);
	try {
		await fetch(config.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				errors: batch,
				service: config.serviceName,
				instanceId: config.instanceId,
			}),
		});
	} catch (err) {
		console.error(
			"[ErrorTracking] Failed to flush error reports:",
			normalizeError(err).message,
		);
	}
}

function _buildErrorReport(err: unknown, req: Request, statusCode: number): ErrorReport {
	const normalized = normalizeError(err);
	return {
		message: normalized.message,
		stack: normalized.stack,
		url: req.originalUrl ?? req.url,
		method: req.method,
		statusCode,
		correlationId: (req as unknown as { correlationId?: string }).correlationId ?? "",
		timestamp: new Date().toISOString(),
		serviceName: config.serviceName,
		serviceVersion: config.serviceVersion,
		instanceId: config.instanceId,
	};
}

export function reportError(err: unknown, req: Request, statusCode: number): void {
	const report = _buildErrorReport(err, req, statusCode);
	BUFFER.push(report);
	if (BUFFER.length >= config.batchSize) {
		void flush();
	}
}

export function errorTrackingMiddleware(
	endpoint?: string,
): (err: Error, req: Request, res: Response, next: NextFunction) => void {
	if (endpoint) {
		configureErrorTracking({
			endpoint: endpoint || process.env.ERROR_URL_WEBHOOK,
		});
	}
	return (err: Error, req: Request, res: Response, next: NextFunction): void => {
		const statusCode = res.statusCode >= 400 ? res.statusCode : 500;
		if (statusCode >= 500) {
			reportError(err, req, statusCode);
		}
		next(err);
	};
}

export function shutdownErrorTracking(): void {
	stopFlushTimer();
	if (BUFFER.length > 0) {
		void flush();
	}
}
