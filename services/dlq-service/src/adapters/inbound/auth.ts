import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { isTimestampFresh } from "@trading-model/crypto/domain/services/hmac-utils";
import { verifySignature as sharedVerifySignature } from "@trading-model/crypto/domain/services/request-signer";
import type {
	Signature,
	SignedRequest,
	Timestamp,
} from "@trading-model/validation/adapters/inbound/signed-request";
import type { NextFunction, Request, Response } from "express";
import { ENV, resolveAuthHmacSecret } from "../../infrastructure/config/env";

const ALLOWED_SERVICES = parseCommaSeparated(ENV.DLQ_ALLOWED_SERVICES);

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

	return sharedVerifySignature(route, {
		signature: provided as Signature,
		timestamp: timestampStr as Timestamp,
		secret,
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

function _validateTimestamp(timestampStr: string, provided: string): boolean {
	if (!(timestampStr && provided)) {
		return false;
	}
	const timestamp = Number.parseInt(timestampStr, 10);
	return isTimestampFresh(timestamp, 300_000);
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
