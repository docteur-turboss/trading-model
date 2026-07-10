import { createHash } from "node:crypto";

import { CRYPTO } from "@trading-model/common/crypto/crypto-constants";
import type { Request, Response } from "express";

import { container } from "../app";

export function health(_req: Request, res: Response): void {
	const caCertPem = container.ca.getCaCertPem();
	const caFingerprint = caCertPem
		? createHash(CRYPTO.SHA256).update(caCertPem).digest(CRYPTO.HEX)
		: null;
	res.status(200).json({
		status: "ok",
		caInitialized: true,
		caFingerprint,
	});
}
