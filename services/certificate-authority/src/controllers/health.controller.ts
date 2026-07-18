import { HTTP_STATUS } from "@trading-model/common/http-status";
import { HEALTH_STATUS_OK } from "@trading-model/common/middleware/response-exception";
import { sha256Hex } from "@trading-model/crypto/crypto/hash-utils";
import type { Request, Response } from "express";

import { container } from "../app";

export function health(_req: Request, res: Response): void {
	const caCertPem = container.ca.getCaCertPem();
	const caFingerprint = caCertPem ? sha256Hex(caCertPem) : null;
	res.status(HTTP_STATUS.OK).json({
		status: HEALTH_STATUS_OK,
		caInitialized: true,
		caFingerprint,
	});
}
