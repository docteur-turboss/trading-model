import type { InstanceId } from "@trading-model/primitives/primitives";
import { verifyHmacSha256Formatted } from "../../adapters/outbound/node-hmac";
import { CryptoAlg } from "../../domain/constants/crypto-constants";

export interface TokenValidationOptions {
	maxAgeMs?: number;
	allowSlidingExpiry?: boolean;
	clockSkewToleranceMs?: number;
}

export interface TokenValidationInput {
	token: string;
	instanceId: InstanceId;
	signingSecret: string;
	storedToken: string | undefined | null;
	options?: TokenValidationOptions;
}

interface TokenFormat {
	encodedId: string;
	payloadParts: string[];
	signature: string;
}

function verifyHmac(format: TokenFormat, signingSecret: string): boolean {
	return verifyHmacSha256Formatted({
		secret: signingSecret,
		signature: format.signature,
		parts: [format.encodedId, format.payloadParts.join(".")],
		separator: ".",
		digest: CryptoAlg.BASE64URL,
	});
}

function checkTokenFormat(token: string): TokenFormat | null {
	const parts = token.split(".");
	if (parts.length !== 3 && parts.length !== 4) {
		return null;
	}
	const [encodedId, ...payloadParts] = parts;
	const signature = payloadParts.pop()!;
	return { encodedId, payloadParts, signature };
}

function _decodeTimestamp(timestampB64: string): number {
	return Number.parseInt(
		Buffer.from(timestampB64, CryptoAlg.BASE64URL).toString(CryptoAlg.UTF8),
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

function _verifyStoredToken(
	storedToken: string | undefined | null,
	signingSecret: string,
	options?: TokenValidationOptions
): boolean {
	if (!(options?.allowSlidingExpiry && storedToken)) {
		return false;
	}
	const storedFormat = checkTokenFormat(storedToken);
	return Boolean(storedFormat && verifyHmac(storedFormat, signingSecret));
}

/** Returns true when the token is well formed, signed for the instance with the secret, and matches the stored token. */
export function validInstanceToken(input: TokenValidationInput): boolean {
	const { token, instanceId, signingSecret, storedToken, options } = input;
	const format = checkTokenFormat(token);
	if (!format) {
		return false;
	}
	const decodedId = Buffer.from(format.encodedId, CryptoAlg.BASE64URL).toString(
		CryptoAlg.UTF8
	);
	if (decodedId !== instanceId) {
		return false;
	}
	// Legacy 4-part tokens carry a timestamp: payloadParts = [timestamp, nonce].
	const isLegacy = format.payloadParts.length === 2;
	if (isLegacy && !validateTimestamp(format.payloadParts[0], options)) {
		return false;
	}
	if (!verifyHmac(format, signingSecret)) {
		return false;
	}
	if (storedToken === token) {
		return true;
	}
	return _verifyStoredToken(storedToken, signingSecret, options);
}
