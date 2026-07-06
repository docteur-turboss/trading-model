import { createHash } from "node:crypto";

import type { Request, Response } from "express";

import { CONTAINER } from "../app/container";

export function ping(_req: Request, res: Response): void {
	res.status(200).json({ status: "ok" });
}

function _computeCaFingerprint(): string | null {
	const caCertPem = CONTAINER.ca.getCaCertPem();
	return caCertPem ? createHash("sha256").update(caCertPem).digest("hex") : null;
}

function _sendUnhealthy(res: Response): void {
	res.status(503).json({ status: "unavailable", caInitialized: false });
}

export function health(_req: Request, res: Response): void {
	if (!CONTAINER.ca.isInitialized()) {
		_sendUnhealthy(res);
		return;
	}
	res.status(200).json({
		status: "ok",
		caInitialized: true,
		caFingerprint: _computeCaFingerprint(),
	});
}
