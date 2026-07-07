import { createHmac } from "node:crypto";

import type { HttpRequestOptions } from "@trading-model/common/config/http-types";
import type {
	HttpRoute,
	Signature,
	SignedRequest,
	SignedRequestAuth,
	Timestamp,
} from "@trading-model/common/contracts/signed-request";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";

function getHmacSecretBuffer(): Buffer {
	const raw = ENV.DLQ_AUTH_HMAC_SECRET ?? "";
	return Buffer.from(raw, "utf-8");
}

function normalizeBody(body: unknown): unknown {
	if (typeof body === "object" && body !== null) {
		return { ...(body as Record<string, unknown>) };
	}
	return body ?? {};
}

interface SignRequestInput extends SignedRequest {
	secretBuf?: Buffer;
}

function signRequest(input: SignRequestInput): SignedRequestAuth {
	const timestamp = String(Date.now()) as Timestamp;
	const buf = input.secretBuf ?? getHmacSecretBuffer();
	try {
		if (buf.length < 16) {
			return warnAndSkip(timestamp);
		}
		return {
			timestamp,
			signature: computeSignature({ ...input, timestamp }, buf) as Signature,
		};
	} finally {
		buf.fill(0);
	}
}

function computeSignature(
	input: SignedRequest & { timestamp: Timestamp },
	buf: Buffer
): string {
	const parts = [
		input.serviceName,
		input.timestamp,
		deterministicStringify(normalizeBody(input.body)),
		input.method,
		input.path,
	].join(":");
	return createHmac("sha256", buf).update(parts).digest("hex");
}

function warnAndSkip(timestamp: Timestamp): SignedRequestAuth {
	logger.warn(
		"DLQ HMAC secret is too short or empty — requests will not be signed"
	);
	return { timestamp, signature: "" as Signature };
}

interface SignedOptionsInput extends HttpRoute {
	body: unknown;
	extra?: Partial<HttpRequestOptions>;
}

export function signedOptions(input: SignedOptionsInput): HttpRequestOptions {
	const opts = buildBaseOptions(input.extra);
	const secretBuf = getHmacSecretBuffer();
	if (secretBuf.length >= 16) {
		addSignature(opts, input, secretBuf);
	}
	return opts;
}

function buildBaseOptions(
	extra?: Partial<HttpRequestOptions>
): HttpRequestOptions & { headers: Record<string, string> } {
	return {
		timeoutMs: 5000,
		...extra,
		headers: {
			[HTTP_HEADERS.X_SERVICE_NAME]: "message-manager",
			...(extra?.headers ?? {}),
		},
	};
}

function addSignature(
	opts: HttpRequestOptions & { headers: Record<string, string> },
	route: HttpRoute & { body: unknown },
	secretBuf: Buffer
): void {
	const { timestamp, signature } = signRequest({
		serviceName: toServiceId("message-manager"),
		...route,
		secretBuf,
	});
	opts.headers[HTTP_HEADERS.X_TIMESTAMP] = timestamp;
	opts.headers[HTTP_HEADERS.X_SIGNATURE] = signature;
}
