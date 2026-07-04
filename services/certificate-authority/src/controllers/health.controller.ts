import { createHash } from "node:crypto";

import type { Request, Response } from "express";

import { CONTAINER } from "../app/container";

export function ping(_req: Request, res: Response): void {
	res.status(200).json({ status: "ok" });
}

export function health(_req: Request, res: Response): void {
	const isReady = CONTAINER.ca.isInitialized();

	if (!isReady) {
		res.status(503).json({
			status: "unavailable",
			caInitialized: false,
		});
		return;
	}

	res.status(200).json({
		status: "ok",
		caInitialized: true,
		caFingerprint: CONTAINER.ca.getCaCertPem()
			? createHash("sha256").update(CONTAINER.ca.getCaCertPem()).digest("hex")
			: null,
	});
}
