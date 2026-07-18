import type { NextFunction, Request, Response } from "express";
import { ErrorBuffer } from "./error-buffer";
import { buildErrorReport } from "./error-report-builder";
import { ErrorTracker } from "./error-tracker";
import type { ErrorTrackingConfig } from "./error-tracking-config";

const Tracker = new ErrorTracker();

export function configureErrorTracking(opts: ErrorTrackingConfig): void {
	Tracker.configure(opts);
}

export function reportError(
	err: unknown,
	req: Request,
	statusCode: import("../http-status").HttpStatusCode
): void {
	Tracker.reportError(err, req, statusCode);
}

export function errorTrackingMiddleware(
	endpoint?: string
): (err: Error, req: Request, res: Response, next: NextFunction) => void {
	return Tracker.createMiddleware(endpoint);
}

export function shutdownErrorTracking(): void {
	Tracker.shutdown();
}

export type { ErrorTrackingConfig };
export { buildErrorReport, ErrorBuffer, ErrorTracker };
