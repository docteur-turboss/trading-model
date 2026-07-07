import { createHash } from "node:crypto";

import type { Request, Response } from "express";

import { CONTAINER } from "../app";

export function health(_req: Request, res: Response): void {
	const caCertPem = CONTAINER.ca.getCaCertPem();
	const caFingerprint = caCertPem
		? createHash("sha256").update(caCertPem).digest("hex")
		: null;
	res.status(200).json({
		status: "ok",
		caInitialized: true,
		caFingerprint,
	});
}
