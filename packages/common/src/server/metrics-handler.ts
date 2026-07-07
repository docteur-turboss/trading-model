import type { Request, Response } from "express";
import promClient from "prom-client";

export function metricsHandler(_req: Request, res: Response): void {
	res.set("Content-Type", promClient.register.contentType);
	promClient.register.metrics().then((data) => res.send(data));
}
