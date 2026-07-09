import type { HttpRequestOptions } from "@trading-model/common/config/http-types";
import type { HttpRoute } from "@trading-model/common/contracts/signed-request";
import { signRequest } from "@trading-model/common/crypto/request-signer";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";

function getHmacSecret(): string {
	return ENV.DLQ_AUTH_HMAC_SECRET ?? "";
}

interface SignedOptionsInput extends HttpRoute {
	body: unknown;
	extra?: Partial<HttpRequestOptions>;
}

export function signedOptions(input: SignedOptionsInput): HttpRequestOptions {
	const opts = buildBaseOptions(input.extra);
	const secret = getHmacSecret();
	if (secret.length >= 16) {
		addSignature(opts, input, secret);
	} else {
		logger.warn(
			"DLQ HMAC secret is too short or empty — requests will not be signed"
		);
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
	secret: string
): void {
	const { timestamp, signature } = signRequest(
		{
			serviceName: toServiceId("message-manager"),
			method: route.method,
			path: route.path,
			body: route.body,
		},
		secret
	);
	opts.headers[HTTP_HEADERS.X_TIMESTAMP] = timestamp;
	opts.headers[HTTP_HEADERS.X_SIGNATURE] = signature;
}
