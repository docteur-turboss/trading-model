import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import type {
	Signature,
	SignedRequest,
	SignedRequestAuth,
	Timestamp,
} from "@trading-model/contracts/signed-request";
import type { ServiceId } from "@trading-model/primitives/primitives";
import { sha256Hex } from "../../adapters/outbound/node-hash";
import {
	createHmacSha256,
	verifyHmacSha256,
} from "../../adapters/outbound/node-hmac";
import { isTimestampFresh } from "../../domain/services/timestamp";

const DEFAULT_TIMESTAMP_TOLERANCE_MS = 300_000;

/** Returns a shallow copy of an object body, or `{}` when the body is nullish, so signer and verifier hash the same value. */
export function normalizeBody(body: unknown): unknown {
	if (typeof body === "object" && body !== null) {
		return { ...(body as Record<string, unknown>) };
	}
	return body ?? {};
}

/** Signs method, path, service name and body hash with the shared secret. Returns an empty signature when the secret is shorter than 16 characters. */
export function signRequest(
	input: SignedRequest,
	secret: string
): SignedRequestAuth {
	const timestamp = String(Date.now()) as Timestamp;
	if (secret.length < 16) {
		return { timestamp, signature: "" as Signature };
	}
	const parts = _buildSignParts(input, timestamp);
	const signature = createHmacSha256(secret, ...parts) as Signature;
	return { timestamp, signature };
}

export interface SignatureVerificationOptions {
	signature: Signature;
	timestamp: Timestamp;
	secret: string;
	toleranceMs?: number;
}

/** Returns true when the signature matches and the timestamp is within `toleranceMs` (default 5 min). */
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
	if (!isTimestampFresh(Number.parseInt(timestamp, 10), toleranceMs)) {
		return false;
	}
	const parts = _buildSignParts(input, timestamp);
	return verifyHmacSha256(secret, signature, ...parts);
}

function _buildSignParts(input: SignedRequest, timestamp: string): string[] {
	const bodyString = deterministicStringify(normalizeBody(input.body));
	const bodyHash = sha256Hex(bodyString);
	return [input.serviceName, timestamp, bodyHash, input.method, input.path];
}

/** Returns the `X-Timestamp`, `X-Signature` and `X-Service-Name` headers for an outgoing request. */
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
