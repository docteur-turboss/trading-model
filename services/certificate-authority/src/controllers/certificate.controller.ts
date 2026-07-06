import type { CertificateResponse } from "@trading-model/common/domain/certificate-base";
import { logger } from "@trading-model/common/config/logger";
import type { RevocationRequest } from "@trading-model/common/domain/revocation-request";
import type { Request, Response } from "express";

import { CONTAINER } from "../app";

function _validateSignRequest(serviceId: unknown, csr: unknown, res: Response): boolean {
	if (serviceId && csr) {
		return true;
	}
	res.status(400).json({ error: "serviceId and csr are required" });
	return false;
}

function _sendSignResponse(res: Response, signed: CertificateResponse, serviceId: string): void {
	logger.info("Certificate signed", {
		context: { serviceId, serialNumber: signed.serialNumber },
	});
	res.status(200).json({
		cert: signed.certPem, caPem: signed.caPem, serialNumber: signed.serialNumber,
		expiresAt: signed.expiresAt, fingerprint: signed.fingerprint,
	});
}

export async function signCertificate(
	req: Request,
	res: Response
): Promise<void> {
	try {
		const { serviceId, csr, ttlMs } = req.body;
		if (!_validateSignRequest(serviceId, csr, res)) {
			return;
		}
		const signed = await CONTAINER.ca.signServiceCertificate({ serviceId, csr, ttlMs });
		_sendSignResponse(res, signed, serviceId);
	} catch (err) {
		logger.error("Failed to sign certificate", { context: { err } });
		res.status(500).json({ error: "Failed to sign certificate" });
	}
}

function _validateGetRequest(serviceId: string | string[] | undefined, res: Response): string | null {
	if (!serviceId) {
		res.status(400).json({ error: "serviceId is required" });
		return null;
	}
	return String(serviceId);
}

function _sendCertResponse(res: Response, cert: CertificateResponse): void {
	res.status(200).json({
		cert: cert.certPem, caPem: cert.caPem, serialNumber: cert.serialNumber,
		issuedAt: cert.issuedAt, expiresAt: cert.expiresAt, fingerprint: cert.fingerprint,
	});
}

export async function getCertificate(
	req: Request,
	res: Response
): Promise<void> {
	try {
		const serviceId = _validateGetRequest(req.params.serviceId, res);
		if (!serviceId) {
			return;
		}
		const cert = await CONTAINER.certificateStore.getByServiceId(serviceId);
		if (!cert) {
			res.status(404).json({ error: "Certificate not found" });
			return;
		}
		_sendCertResponse(res, cert);
	} catch (err) {
		logger.error("Failed to get certificate", { context: { err } });
		res.status(500).json({ error: "Failed to get certificate" });
	}
}

function _validateRevocationRequest(req: RevocationRequest, res: Response): boolean {
	if (req.serialNumber && req.reason) {
		return true;
	}
	res.status(400).json({ error: "serialNumber and reason are required" });
	return false;
}

export async function revokeCertificate(
	req: Request,
	res: Response
): Promise<void> {
	try {
		const revocationRequest = req.body as RevocationRequest;
		if (!_validateRevocationRequest(revocationRequest, res)) {
			return;
		}
		await CONTAINER.ca.revokeCertificate(revocationRequest);
		logger.info("Certificate revoked", {
			context: { serialNumber: revocationRequest.serialNumber, reason: revocationRequest.reason },
		});
		res.status(200).json({ message: "Certificate revoked" });
	} catch (err) {
		logger.error("Failed to revoke certificate", { context: { err } });
		res.status(500).json({ error: "Failed to revoke certificate" });
	}
}
