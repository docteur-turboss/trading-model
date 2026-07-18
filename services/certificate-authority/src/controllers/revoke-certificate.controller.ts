import { logger } from "@trading-model/common/config/logger";
import type { RevocationRequest } from "@trading-model/common/domain/revocation-request";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import type { Request, Response } from "express";

import { container } from "../app";

function validate(req: RevocationRequest, res: Response): boolean {
	if (req.serialNumber && req.reason) {
		return true;
	}
	res
		.status(HTTP_STATUS.BAD_REQUEST)
		.json({ error: "serialNumber and reason are required" });
	return false;
}

function sendSuccess(
	res: Response,
	revocationRequest: RevocationRequest
): void {
	logger.info("Certificate revoked", {
		context: {
			serialNumber: revocationRequest.serialNumber,
			reason: revocationRequest.reason,
		},
	});
	res.status(HTTP_STATUS.OK).json({ message: "Certificate revoked" });
}

function sendError(res: Response, err: unknown): void {
	logger.error("Failed to revoke certificate", { context: { err } });
	res
		.status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
		.json({ error: "Failed to revoke certificate" });
}

export async function revokeCertificate(
	req: Request,
	res: Response
): Promise<void> {
	try {
		const revocationRequest = req.body as RevocationRequest;
		if (!validate(revocationRequest, res)) {
			return;
		}
		await container.ca.revokeCertificate(revocationRequest);
		sendSuccess(res, revocationRequest);
	} catch (err) {
		sendError(res, err);
	}
}
