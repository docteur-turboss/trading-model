import { createHmac, timingSafeEqual } from "node:crypto";
import { ServiceInstanceName } from "../config/services.types";
import { generateRandomStr } from "./random";

export interface TokenValidationOptions {
	maxAgeMs?: number;
	allowSlidingExpiry?: boolean;
	clockSkewToleranceMs?: number;
}

interface TokenFormat {
	encodedId: string;
	payloadParts: string[];
	signature: string;
	isLegacy: boolean;
}

function checkTokenFormat(token: string): TokenFormat | null {
	const parts = token.split(".");
	if (parts.length !== 3 && parts.length !== 4) {
		return null;
	}
	const [encodedId, ...payloadParts] = parts;
	const signature = payloadParts.pop()!;
	return { encodedId, payloadParts, signature, isLegacy: parts.length === 4 };
}

function validateTimestamp(
	timestampB64: string,
	options?: TokenValidationOptions
): boolean {
	const maxAge = options?.maxAgeMs ?? 300_000;
	const clockSkewTolerance = options?.clockSkewToleranceMs ?? 5_000;
	const ts = Number.parseInt(
		Buffer.from(timestampB64, "base64url").toString("utf8"),
		10
	);
	const now = Date.now();
	if (Number.isNaN(ts)) {
		return false;
	}
	if (now - ts > maxAge + clockSkewTolerance) {
		return false;
	}
	if (ts - now > clockSkewTolerance) {
		return false;
	}
	return true;
}

export function generateInstanceToken(
	instanceId: string,
	signingSecret: string
): string {
	const encodedId = Buffer.from(instanceId, "utf8").toString("base64url");
	const nonce = generateRandomStr();

	const hmac = createHmac("sha256", signingSecret)
		.update(`${encodedId}.${nonce}`)
		.digest("base64url");

	return `${encodedId}.${nonce}.${hmac}`;
}

export function validInstanceToken(
	token: string,
	instanceId: string,
	signingSecret: string,
	storedToken: string | undefined | null,
	options?: TokenValidationOptions
): boolean {
	const format = checkTokenFormat(token);
	if (!format) {
		return false;
	}

	const decodedId = Buffer.from(format.encodedId, "base64url").toString("utf8");
	if (decodedId !== instanceId) {
		return false;
	}

	if (format.isLegacy && !validateTimestamp(format.payloadParts[0], options)) {
		return false;
	}

	if (
		!verifyHmac(
			format.encodedId,
			format.payloadParts,
			format.signature,
			signingSecret
		)
	) {
		return false;
	}

	if (storedToken === token) {
		return true;
	}

	if (options?.allowSlidingExpiry && storedToken) {
		const storedFormat = checkTokenFormat(storedToken);
		if (
			storedFormat &&
			verifyHmac(
				storedFormat.encodedId,
				storedFormat.payloadParts,
				storedFormat.signature,
				signingSecret
			)
		) {
			return true;
		}
	}

	return false;
}

function verifyHmac(
	encodedId: string,
	payloadParts: string[],
	signature: string,
	signingSecret: string
): boolean {
	const payload = payloadParts.join(".");
	const expectedHmac = createHmac("sha256", signingSecret)
		.update(`${encodedId}.${payload}`)
		.digest("base64url");
	try {
		return timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(signature));
	} catch {
		return false;
	}
}

export function generateInstanceId(
	serviceName: string,
	address: string,
	port: number
): string {
	return createHmac("sha256", generateRandomStr())
		.update(`${serviceName}-${address}:${port}-${Date.now()}`)
		.digest("base64");
}

export function verifyInstanceName(serviceName: string): boolean {
	return (Object.values(ServiceInstanceName) as readonly string[]).includes(
		serviceName
	);
}
