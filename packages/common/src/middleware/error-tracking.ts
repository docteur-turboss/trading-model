import type { NextFunction, Request, Response } from "express";

import { logger } from "../config/logger";
import { URLString } from "../domain/primitives";
import { HTTP_STATUS, type HttpStatusCode } from "../http-status";
import { TimerHandle } from "../utils/timer-handle";
import { ErrorBuffer } from "./error-buffer";
import { buildErrorReport } from "./error-report-builder";
import {
	buildConfig,
	DEFAULT_CONFIG,
	type ErrorTrackingConfig,
	type ResolvedErrorTrackingConfig,
} from "./error-tracking-config";

let config: ResolvedErrorTrackingConfig = DEFAULT_CONFIG;
let errorBuffer: ErrorBuffer | null = null;
const flushTimer = new TimerHandle();

export function configureErrorTracking(opts: ErrorTrackingConfig): void {
	config = buildConfig(opts);
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

function startFlushTimer(): void {
	if (flushTimer.isRunning) {
		return;
	}
	flushTimer.startInterval(
		() => void errorBuffer?.flush(),
		config.flushIntervalMs
	);
	flushTimer.unref();
}

function stopFlushTimer(): void {
	flushTimer.stop();
}

export function reportError(
	err: unknown,
	req: Request,
	statusCode: HttpStatusCode
): void {
	if (!errorBuffer) {
		return;
	}
	const report = buildErrorReport(err, req, statusCode, config);
	errorBuffer.add(report);
}

function _configureIfEndpoint(endpoint: string): void {
	configureErrorTracking({
		endpoint: URLString.of(endpoint || process.env.ERROR_URL_WEBHOOK || ""),
	});
}

function _createTrackingHandler(): (
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction
) => void {
	return (err, req, res, next) => {
		const statusCode = _determineStatusCode(res);
		if (statusCode >= 500) {
			reportError(err, req, statusCode);
		}
		next(err);
	};
}

function _determineStatusCode(res: Response): HttpStatusCode {
	return (
		res.statusCode >= 400 ? res.statusCode : HTTP_STATUS.INTERNAL_SERVER_ERROR
	) as HttpStatusCode;
}

export function errorTrackingMiddleware(
	endpoint?: string
): (err: Error, req: Request, res: Response, next: NextFunction) => void {
	if (endpoint) {
		_configureIfEndpoint(endpoint);
	}
	return _createTrackingHandler();
}

export function shutdownErrorTracking(): void {
	stopFlushTimer();
	if (errorBuffer && errorBuffer.pendingCount > 0) {
		void errorBuffer.flush();
	}
	errorBuffer = null;
}
