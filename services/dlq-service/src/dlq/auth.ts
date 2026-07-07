import type { SignedRequest } from "@trading-model/common/contracts/signed-request";
import {
	normalizeBody,
	verifySignature as sharedVerifySignature,
} from "@trading-model/common/crypto/request-signer";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import type { NextFunction, Request, Response } from "express";
import { ENV, resolveAuthHmacSecret } from "../config/env";

const ALLOWED_SERVICES = ENV.DLQ_ALLOWED_SERVICES.split(",")
	.map((service) => service.trim())
	.filter(Boolean);

function verifySignature(req: Request, serviceName: string): boolean {
	const secret = resolveAuthHmacSecret();
	const provided = _extractSignatureHeader(req);
	const timestampStr = _extractTimestampHeader(req);

	if (!_validateTimestamp(timestampStr, provided)) {
		return false;
	}

	const route = _buildSignedRequest(req, serviceName);

	if (sharedVerifySignature(route, provided, timestampStr, secret)) {
		return true;
	}

	return _matchFallbackSignature(
		req,
		serviceName,
		provided,
		secret,
		timestampStr,
		route
	);
}

function _extractSignatureHeader(req: Request): string {
	return (req.headers[HTTP_HEADERS.X_SIGNATURE] as string) || "";
}

function _extractTimestampHeader(req: Request): string {
	return (req.headers[HTTP_HEADERS.X_TIMESTAMP] as string) || "";
}

function _buildSignedRequest(req: Request, serviceName: string): SignedRequest {
	return {
		serviceName: toServiceId(serviceName),
		method: req.method as SignedRequest["method"],
		path: req.path,
		body: req.body,
	};
}

function _matchFallbackSignature(
	req: Request,
	serviceName: string,
	provided: string,
	secret: string,
	timestampStr: string,
	route: SignedRequest
): boolean {
	const oldParts = [
		serviceName,
		timestampStr,
		_computeBodyString(req) ?? "",
		route.method,
		route.path,
	];
	return _matchSignature(provided, secret, oldParts);
}

function _computeBodyString(req: Request): string | null {
	try {
		return JSON.stringify(normalizeBody(req.body));
	} catch {
		return null;
	}
}

function _validateTimestamp(timestampStr: string, provided: string): boolean {
	if (!(timestampStr && provided)) {
		return false;
	}
	const timestamp = Number.parseInt(timestampStr, 10);
	if (Number.isNaN(timestamp)) {
		return false;
	}
	if (Math.abs(Date.now() - timestamp) > 300_000) {
		return false;
	}
	return true;
}

function _matchSignature(
	provided: string,
	secret: string,
	parts: string[]
): boolean {
	const { createHmac, timingSafeEqual } = require("node:crypto");
	const expected = createHmac("sha256", secret)
		.update(parts.join(":"))
		.digest("hex");
	return (
		provided.length === expected.length &&
		timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
	);
}

function serviceAuth(req: Request, res: Response, next: NextFunction): void {
	const serviceName = req.headers[HTTP_HEADERS.X_SERVICE_NAME] as
		| string
		| undefined;
	if (!(serviceName && ALLOWED_SERVICES.includes(serviceName))) {
		res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Unauthorized service" });
		return;
	}
	if (!verifySignature(req, serviceName)) {
		res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Invalid or expired signature" });
		return;
	}
	next();
}

export { serviceAuth };
