import type { Request, RequestHandler, Response } from "express";
import promClient, { type Registry } from "prom-client";

export function createMetricsHandler(registry: Registry): RequestHandler {
	return (_req: Request, res: Response): void => {
		res.set("Content-Type", registry.contentType);
		registry.metrics().then((data) => res.send(data));
	};
}

export const metricsHandler = createMetricsHandler(promClient.register);
