import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";
import {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { env, resolveAuthHmacSecret } from "../config/env";
import { logger } from "../config/logger";

const ALLOWED_SERVICES = env.DLQ_ALLOWED_SERVICES.split(",")
	.map((service) => service.trim())
	.filter(Boolean);

function normalizeBody(body: unknown): unknown {
	return body ?? {};
}

function verifySignature(req: Request, serviceName: string): boolean {
	const secret = resolveAuthHmacSecret();

	const provided = (req.headers["x-signature"] as string) || "";
	const timestampStr = (req.headers["x-timestamp"] as string) || "";

	if (!_validateTimestamp(timestampStr, provided)) {
		return false;
	}

	const bodyHash = _computeBodyHash(req, serviceName);
	if (!bodyHash) {
		return false;
	}

	const parts = [serviceName, timestampStr, bodyHash, req.method, req.path];
	if (_matchSignature(provided, secret, parts)) {
		return true;
	}

	const oldParts = [
		serviceName,
		timestampStr,
		_computeBodyString(req, serviceName) ?? "",
		req.method,
		req.path,
	];

	return _matchSignature(provided, secret, oldParts);
}

function _computeBodyString(req: Request, serviceName: string): string | null {
	try {
		return deterministicStringify(normalizeBody(req.body));
	} catch {
		logger.warn("Failed to stringify request body for signature verification", {
			context: { serviceName },
		});
		return null;
	}
}

function _computeBodyHash(req: Request, serviceName: string): string | null {
	const bodyString = _computeBodyString(req, serviceName);
	if (!bodyString) {
		return null;
	}
	return createHash("sha256").update(bodyString).digest("hex");
}

function _validateTimestamp(
	timestampStr: string,
	provided: string
): number | null {
	if (!(timestampStr && provided)) {
		return null;
	}
	const timestamp = Number.parseInt(timestampStr, 10);
	if (Number.isNaN(timestamp)) {
		return null;
	}
	if (Math.abs(Date.now() - timestamp) > 300_000) {
		return null;
	}
	return timestamp;
}

function _matchSignature(
	provided: string,
	secret: string,
	parts: string[]
): boolean {
	const expected = createHmac("sha256", secret)
		.update(parts.join(":"))
		.digest("hex");
	return (
		provided.length === expected.length &&
		timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
	);
}

function serviceAuth(req: Request, res: Response, next: NextFunction): void {
	const serviceName = req.headers["x-service-name"] as string | undefined;
	if (!(serviceName && ALLOWED_SERVICES.includes(serviceName))) {
		res.status(403).json({ error: "Unauthorized service" });
		return;
	}
	if (!verifySignature(req, serviceName)) {
		res.status(401).json({ error: "Invalid or expired signature" });
		return;
	}
	next();
}

export { serviceAuth };
