import { logger } from "@trading-model/common/config/logger";
import {
	toServiceId,
	type UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import type { Request, Response } from "express";

import { container } from "../app";

function validate(
	serviceId: string | string[] | undefined,
	res: Response
): string | null {
	if (!serviceId) {
		res
			.status(HTTP_STATUS.BAD_REQUEST)
			.json({ error: "serviceId is required" });
		return null;
	}
	return String(serviceId);
}

function sendSuccess(
	res: Response,
	cert: {
		certPem: string;
		caPem: string;
		serialNumber: string;
		issuedAt: UnixTimestamp;
		expiresAt: UnixTimestamp;
		fingerprint: string;
	}
): void {
	res.status(HTTP_STATUS.OK).json({
		certPem: cert.certPem,
		caPem: cert.caPem,
		serialNumber: cert.serialNumber,
		issuedAt: cert.issuedAt,
		expiresAt: cert.expiresAt,
		fingerprint: cert.fingerprint,
	});
}

export async function getCertificate(
	req: Request,
	res: Response
): Promise<void> {
	try {
		const serviceId = validate(req.params.serviceId, res);
		if (!serviceId) {
			return;
		}
		const cert = await container.certificateStore.getByServiceId(
			toServiceId(serviceId)
		);
		if (!cert) {
			res
				.status(HTTP_STATUS.NOT_FOUND)
				.json({ error: "Certificate not found" });
			return;
		}
		sendSuccess(res, cert);
	} catch (err) {
		logger.error("Failed to get certificate", { context: { err } });
		res
			.status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
			.json({ error: "Failed to get certificate" });
	}
}
