import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";
import {
	normalizeBody,
	verifySignature as sharedVerifySignature,
} from "@trading-model/crypto/crypto/request-signer";
import type { SignedRequest } from "@trading-model/validation/contracts/signed-request";
import type { NextFunction, Request, Response } from "express";
import { ENV, resolveAuthHmacSecret } from "../config/env";

const TIMESTAMP_TOLERANCE_MS = 300_000;

const ALLOWED_SERVICES = ENV.DLQ_ALLOWED_SERVICES.split(",")
	.map((service) => service.trim())
	.filter(Boolean);

function verifySignature(
	req: Request,
	serviceName: ServiceInstanceName
): boolean {
	const secret = resolveAuthHmacSecret();
	const provided = _extractSignatureHeader(req);
	const timestampStr = _extractTimestampHeader(req);

	if (!_validateTimestamp(timestampStr, provided)) {
		return false;
	}

	const route = _buildSignedRequest(req, serviceName);

	if (
		sharedVerifySignature(route, {
			signature: provided,
			timestamp: timestampStr,
			secret,
		})
	) {
		return true;
	}

	return _matchFallbackSignature({
		req,
		serviceName,
		provided,
		secret,
		timestampStr,
		route,
	});
}

function _extractSignatureHeader(req: Request): string {
	return (req.headers[HTTP_HEADERS.X_SIGNATURE] as string) || "";
}

function _extractTimestampHeader(req: Request): string {
	return (req.headers[HTTP_HEADERS.X_TIMESTAMP] as string) || "";
}

function _buildSignedRequest(
	req: Request,
	serviceName: ServiceInstanceName
): SignedRequest {
	return {
		serviceName: toServiceId(serviceName),
		method: req.method as SignedRequest["method"],
		path: req.path,
		body: req.body,
	};
}

interface SignatureContext {
	req: Request;
	serviceName: ServiceInstanceName;
	provided: string;
	secret: string;
	timestampStr: string;
	route: SignedRequest;
}

function _matchFallbackSignature(ctx: SignatureContext): boolean {
	const oldParts = [
		ctx.serviceName,
		ctx.timestampStr,
		_computeBodyString(ctx.req) ?? "",
		ctx.route.method,
		ctx.route.path,
	];
	return _matchSignature(ctx.provided, ctx.secret, oldParts);
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
	if (Math.abs(Date.now() - timestamp) > TIMESTAMP_TOLERANCE_MS) {
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
	const expected = createHmac(CryptoAlg.SHA256, secret)
		.update(parts.join(":"))
		.digest(CryptoAlg.HEX);
	return (
		provided.length === expected.length &&
		timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
	);
}

function serviceAuth(req: Request, res: Response, next: NextFunction): void {
	const serviceName = _resolveServiceName(req);
	if (!serviceName) {
		res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Unauthorized service" });
		return;
	}
	if (!verifySignature(req, serviceName)) {
		res
			.status(HTTP_STATUS.UNAUTHORIZED)
			.json({ error: "Invalid or expired signature" });
		return;
	}
	next();
}

function _resolveServiceName(req: Request): ServiceInstanceName | undefined {
	const serviceName = req.headers[HTTP_HEADERS.X_SERVICE_NAME] as
		| string
		| undefined;
	if (serviceName && ALLOWED_SERVICES.includes(serviceName)) {
		return serviceName as ServiceInstanceName;
	}
}

export { serviceAuth };
