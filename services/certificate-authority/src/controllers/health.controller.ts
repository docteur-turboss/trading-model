import { createHash } from "node:crypto";

import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import { HEALTH_STATUS_OK } from "@trading-model/common/middleware/response-exception";
import type { Request, Response } from "express";

import { container } from "../app";

export function health(_req: Request, res: Response): void {
	const caCertPem = container.ca.getCaCertPem();
	const caFingerprint = caCertPem
		? createHash(CryptoAlg.SHA256).update(caCertPem).digest(CryptoAlg.HEX)
		: null;
	res.status(HTTP_STATUS.OK).json({
		status: HEALTH_STATUS_OK,
		caInitialized: true,
		caFingerprint,
	});
}
