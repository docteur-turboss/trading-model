import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type {
	Signature,
	SignedRequest,
	Timestamp,
} from "@trading-model/contracts/signed-request";
import { verifySignature as sharedVerifySignature } from "@trading-model/crypto/application/services/request-signer";
import { toServiceId } from "@trading-model/primitives/primitives";
import type { NextFunction, Request, Response } from "express";
import { ENV, resolveAuthHmacSecret } from "../../infrastructure/config/env";

const ALLOWED_SERVICES = parseCommaSeparated(ENV.DLQ_ALLOWED_SERVICES);

function verifySignature(
	req: Request,
	serviceName: ServiceInstanceName
): boolean {
	return sharedVerifySignature(_buildSignedRequest(req, serviceName), {
		signature: _extractSignatureHeader(req) as Signature,
		timestamp: _extractTimestampHeader(req) as Timestamp,
		secret: resolveAuthHmacSecret(),
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
		// The query is signed too: `/dlq/replay?limit=...` is another request.
		path: req.originalUrl,
		body: req.body,
	};
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
