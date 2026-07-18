import { logger } from "@trading-model/common/config/logger";
import type {
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import type { Request, Response } from "express";

import { container } from "../app";

function validate(serviceId: unknown, csr: unknown, res: Response): boolean {
	if (serviceId && csr) {
		return true;
	}
	res
		.status(HTTP_STATUS.BAD_REQUEST)
		.json({ error: "serviceId and csr are required" });
	return false;
}

function sendSuccess(
	res: Response,
	signed: {
		certPem: string;
		caPem: string;
		serialNumber: string;
		expiresAt: UnixTimestamp;
		fingerprint: string;
	},
	serviceId: ServiceId
): void {
	logger.info("Certificate signed", {
		context: { serviceId, serialNumber: signed.serialNumber },
	});
	res.status(HTTP_STATUS.OK).json({
		certPem: signed.certPem,
		caPem: signed.caPem,
		serialNumber: signed.serialNumber,
		expiresAt: signed.expiresAt,
		fingerprint: signed.fingerprint,
	});
}

export async function signCertificate(
	req: Request,
	res: Response
): Promise<void> {
	try {
		const { serviceId, csr, ttlMs } = req.body;
		if (!validate(serviceId, csr, res)) {
			return;
		}
		const signed = await container.ca.signCertificate({
			serviceId,
			csr,
			ttlMs,
		});
		sendSuccess(res, signed, serviceId);
	} catch (err) {
		logger.error("Failed to sign certificate", { context: { err } });
		res
			.status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
			.json({ error: "Failed to sign certificate" });
	}
}
