import { createHmac, timingSafeEqual } from "node:crypto";
import { ServiceInstanceName } from "../config/services.types";
import type { InstanceId } from "../domain/primitives";
import type { ServiceEndpoint } from "../domain/service-identity";
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

function _decodeTimestamp(timestampB64: string): number {
	return Number.parseInt(
		Buffer.from(timestampB64, "base64url").toString("utf8"),
		10
	);
}

function validateTimestamp(
	timestampB64: string,
	options?: TokenValidationOptions
): boolean {
	const ts = _decodeTimestamp(timestampB64);
	if (Number.isNaN(ts)) {
		return false;
	}
	const maxAge = options?.maxAgeMs ?? 300_000;
	const clockSkewTolerance = options?.clockSkewToleranceMs ?? 5_000;
	const now = Date.now();
	if (now - ts > maxAge + clockSkewTolerance) {
		return false;
	}
	if (ts - now > clockSkewTolerance) {
		return false;
	}
	return true;
}

export function generateInstanceToken(
	instanceId: InstanceId,
	signingSecret: string
): string {
	const encodedId = Buffer.from(instanceId, "utf8").toString("base64url");
	const nonce = generateRandomStr();

	const hmac = createHmac("sha256", signingSecret)
		.update(`${encodedId}.${nonce}`)
		.digest("base64url");

	return `${encodedId}.${nonce}.${hmac}`;
}

export interface TokenValidationInput {
	token: string;
	instanceId: InstanceId;
	signingSecret: string;
	storedToken: string | undefined | null;
	options?: TokenValidationOptions;
}

function _decodeInstanceId(format: TokenFormat): string {
	return Buffer.from(format.encodedId, "base64url").toString("utf8");
}

function _checkLegacyTimestamp(
	format: TokenFormat,
	options?: TokenValidationOptions
): boolean {
	return !format.isLegacy || validateTimestamp(format.payloadParts[0], options);
}

function _verifyStoredToken(
	storedToken: string | undefined | null,
	signingSecret: string,
	options?: TokenValidationOptions
): boolean {
	if (!(options?.allowSlidingExpiry && storedToken)) {
		return false;
	}
	const storedFormat = checkTokenFormat(storedToken);
	return Boolean(
		storedFormat &&
			verifyHmac({
				encodedId: storedFormat.encodedId,
				payloadParts: storedFormat.payloadParts,
				signature: storedFormat.signature,
				signingSecret,
			})
	);
}

export function validInstanceToken(input: TokenValidationInput): boolean {
	const { token, instanceId, signingSecret, storedToken, options } = input;
	const format = checkTokenFormat(token);
	if (!format) {
		return false;
	}
	if (_decodeInstanceId(format) !== instanceId) {
		return false;
	}
	if (!_checkLegacyTimestamp(format, options)) {
		return false;
	}
	if (
		!verifyHmac({
			encodedId: format.encodedId,
			payloadParts: format.payloadParts,
			signature: format.signature,
			signingSecret,
		})
	) {
		return false;
	}
	if (storedToken === token) {
		return true;
	}
	return _verifyStoredToken(storedToken, signingSecret, options);
}

interface HmacVerificationInput {
	encodedId: string;
	payloadParts: string[];
	signature: string;
	signingSecret: string;
}

function verifyHmac(input: HmacVerificationInput): boolean {
	const { encodedId, payloadParts, signature, signingSecret } = input;
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

export function generateInstanceId({
	serviceName,
	address,
	port,
}: ServiceEndpoint): string {
	return createHmac("sha256", generateRandomStr())
		.update(`${serviceName}-${address}:${port}-${Date.now()}`)
		.digest("base64");
}

export function verifyInstanceName(serviceName: ServiceInstanceName): boolean {
	return (Object.values(ServiceInstanceName) as readonly string[]).includes(
		serviceName
	);
}
