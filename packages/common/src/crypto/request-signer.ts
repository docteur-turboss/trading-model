import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type {
	Signature,
	SignedRequest,
	SignedRequestAuth,
	Timestamp,
} from "../contracts/signed-request";
import type { ServiceId } from "../domain/primitives";
import { toServiceId } from "../domain/primitives";
import { HTTP_HEADERS } from "../http-headers";
import { deterministicStringify } from "../utils/deterministic-stringify";
import { CryptoAlg } from "./crypto-constants";

const DEFAULT_TIMESTAMP_TOLERANCE_MS = 300_000;

export function normalizeBody(body: unknown): unknown {
	if (typeof body === "object" && body !== null) {
		return { ...(body as Record<string, unknown>) };
	}
	return body ?? {};
}

export function signRequest(
	input: SignedRequest,
	secret: string
): SignedRequestAuth {
	const timestamp = String(Date.now()) as Timestamp;
	if (secret.length < 16) {
		return { timestamp, signature: "" as Signature };
	}
	const parts = _buildSignParts(input, timestamp, secret);
	const signature = createHmac(CryptoAlg.SHA256, secret)
		.update(parts.join(":"))
		.digest(CryptoAlg.HEX) as Signature;
	return { timestamp, signature };
}

export interface SignatureVerificationOptions {
	signature: Signature;
	timestamp: Timestamp;
	secret: string;
	toleranceMs?: number;
}

export function verifySignature(
	input: SignedRequest,
	options: SignatureVerificationOptions
): boolean {
	const {
		signature,
		timestamp,
		secret,
		toleranceMs = DEFAULT_TIMESTAMP_TOLERANCE_MS,
	} = options;
	if (!(timestamp && signature)) {
		return false;
	}
	if (!_isTimestampValid(timestamp, toleranceMs)) {
		return false;
	}
	return _verifyHmacMatch(input, timestamp, secret, signature);
}

function _isTimestampValid(timestamp: string, toleranceMs: number): boolean {
	const ts = Number.parseInt(timestamp, 10);
	return !Number.isNaN(ts) && Math.abs(Date.now() - ts) <= toleranceMs;
}

function _verifyHmacMatch(
	input: SignedRequest,
	timestamp: string,
	secret: string,
	signature: string
): boolean {
	const parts = _buildSignParts(input, timestamp, secret);
	const expected = createHmac(CryptoAlg.SHA256, secret)
		.update(parts.join(":"))
		.digest(CryptoAlg.HEX);
	return (
		signature.length === expected.length &&
		timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
	);
}

function _buildSignParts(
	input: SignedRequest,
	timestamp: string,
	_secret: string
): string[] {
	const bodyString = deterministicStringify(normalizeBody(input.body));
	const bodyHash = createHash(CryptoAlg.SHA256)
		.update(bodyString)
		.digest(CryptoAlg.HEX);
	return [input.serviceName, timestamp, bodyHash, input.method, input.path];
}

export function buildSignedHeaders(
	input: SignedRequest,
	secret: string
): Record<string, Signature | Timestamp | ServiceId> {
	const { timestamp, signature } = signRequest(input, secret);
	return {
		[HTTP_HEADERS.X_TIMESTAMP]: timestamp,
		[HTTP_HEADERS.X_SIGNATURE]: signature,
		[HTTP_HEADERS.X_SERVICE_NAME]: input.serviceName,
	};
}

export function extractRequestParts(
	headers: Record<string, string | string[] | undefined>,
	_method: string,
	_path: string,
	_body: unknown
): {
	serviceName: ServiceId;
	signature: Signature;
	timestamp: Timestamp;
} | null {
	const serviceName = headers[HTTP_HEADERS.X_SERVICE_NAME] as
		| string
		| undefined;
	const signature = headers[HTTP_HEADERS.X_SIGNATURE] as string | undefined;
	const timestamp = headers[HTTP_HEADERS.X_TIMESTAMP] as string | undefined;
	if (!(serviceName && signature && timestamp)) {
		return null;
	}
	return {
		serviceName: toServiceId(serviceName),
		signature: signature as Signature,
		timestamp: timestamp as Timestamp,
	};
}
