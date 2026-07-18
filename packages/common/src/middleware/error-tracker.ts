import type { Request, Response } from "express";
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

export class ErrorTracker {
	private _config: ResolvedErrorTrackingConfig = DEFAULT_CONFIG;
	private _errorBuffer: ErrorBuffer | null = null;
	private readonly _flushTimer = new TimerHandle();

	configure(opts: ErrorTrackingConfig): void {
		this._config = buildConfig(opts);
		if (this._config.endpoint) {
			this._errorBuffer = new ErrorBuffer({
				endpoint: this._config.endpoint,
				batchSize: this._config.batchSize,
				serviceName: this._config.serviceName,
				instanceId: this._config.instanceId,
			});
			this._startFlushTimer();
			logger.info("Error tracking configured", {
				context: {
					endpoint: this._config.endpoint,
					service: this._config.serviceName,
				},
			});
		}
	}

	private _startFlushTimer(): void {
		if (this._flushTimer.isRunning) {
			return;
		}
		this._flushTimer.startInterval(
			() => void this._errorBuffer?.flush(),
			this._config.flushIntervalMs
		);
		this._flushTimer.unref();
	}

	private _stopFlushTimer(): void {
		this._flushTimer.stop();
	}

	reportError(err: unknown, req: Request, statusCode: HttpStatusCode): void {
		if (!this._errorBuffer) {
			return;
		}
		const report = buildErrorReport(err, req, statusCode, this._config);
		this._errorBuffer.add(report);
	}

	private _determineStatusCode(res: Response): HttpStatusCode {
		return (
			res.statusCode >= 400 ? res.statusCode : HTTP_STATUS.INTERNAL_SERVER_ERROR
		) as HttpStatusCode;
	}

	createMiddleware(
		endpoint?: string
	): (
		err: Error,
		req: Request,
		res: Response,
		next: (err?: unknown) => void
	) => void {
		if (endpoint) {
			this._configureIfEndpoint(endpoint);
		}
		return (err, req, res, next) => {
			const statusCode = this._determineStatusCode(res);
			if (statusCode >= 500) {
				this.reportError(err, req, statusCode);
			}
			next(err);
		};
	}

	private _configureIfEndpoint(endpoint: string): void {
		this.configure({
			endpoint: URLString.of(endpoint || process.env.ERROR_URL_WEBHOOK || ""),
		});
	}

	shutdown(): void {
		this._stopFlushTimer();
		if (this._errorBuffer && this._errorBuffer.pendingCount > 0) {
			void this._errorBuffer.flush();
		}
		this._errorBuffer = null;
	}
}
