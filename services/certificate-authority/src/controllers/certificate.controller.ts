import { logger } from "@trading-model/common/config/logger";
import type { Request, Response } from "express";

import { CONTAINER } from "../app/container";

export async function signCertificate(
	req: Request,
	res: Response
): Promise<void> {
	try {
		const { serviceId, csr, ttlMs } = req.body;

		if (!(serviceId && csr)) {
			res.status(400).json({ error: "serviceId and csr are required" });
			return;
		}

		const signed = await CONTAINER.ca.signServiceCertificate(
			serviceId,
			csr,
			ttlMs
		);

		logger.info("Certificate signed", {
			serviceId,
			serialNumber: signed.serialNumber,
		});

		res.status(200).json({
			cert: signed.certPem,
			caPem: signed.caPem,
			serialNumber: signed.serialNumber,
			expiresAt: signed.expiresAt,
			fingerprint: signed.fingerprint,
		});
	} catch (err) {
		logger.error("Failed to sign certificate", { err });
		res.status(500).json({ error: "Failed to sign certificate" });
	}
}

export async function getCertificate(
	req: Request,
	res: Response
): Promise<void> {
	try {
		if (!req.params.serviceId) {
			res.status(400).json({ error: "serviceId is required" });
			return;
		}

		const serviceId = String(req.params.serviceId);

		const cert = await CONTAINER.certificateStore.getByServiceId(serviceId);

		if (!cert) {
			res.status(404).json({ error: "Certificate not found" });
			return;
		}

		res.status(200).json({
			cert: cert.certPem,
			caPem: cert.caPem,
			serialNumber: cert.serialNumber,
			issuedAt: cert.issuedAt,
			expiresAt: cert.expiresAt,
			fingerprint: cert.fingerprint,
		});
	} catch (err) {
		logger.error("Failed to get certificate", { err });
		res.status(500).json({ error: "Failed to get certificate" });
	}
}

export async function revokeCertificate(
	req: Request,
	res: Response
): Promise<void> {
	try {
		const { serialNumber, reason } = req.body;

		if (!(serialNumber && reason)) {
			res.status(400).json({ error: "serialNumber and reason are required" });
			return;
		}

		await CONTAINER.ca.revokeCertificate(serialNumber, reason);

		logger.info("Certificate revoked", { serialNumber, reason });

		res.status(200).json({ message: "Certificate revoked" });
	} catch (err) {
		logger.error("Failed to revoke certificate", { err });
		res.status(500).json({ error: "Failed to revoke certificate" });
	}
}
