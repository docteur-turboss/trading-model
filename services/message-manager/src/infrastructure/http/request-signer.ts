import type { HttpRequestOptions } from "@trading-model/common/config/http-types";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	DurationMs,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { signRequest } from "@trading-model/crypto/domain/services/request-signer";
import type { HttpRoute } from "@trading-model/validation/adapters/inbound/signed-request";
import { logger } from "../../config/logger";
import { ENV } from "../config/env";

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
			"DLQ HMAC secret is too short or empty and requests will not be signed"
		);
	}
	return opts;
}

function buildBaseOptions(
	extra?: Partial<HttpRequestOptions>
): HttpRequestOptions & { headers: Record<string, string> } {
	return {
		timeoutMs: DurationMs.of(5000),
		...extra,
		headers: {
			[HTTP_HEADERS.X_SERVICE_NAME]: ServiceInstanceName.MessageManagerService,
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
			serviceName: toServiceId(ServiceInstanceName.MessageManagerService),
			method: route.method,
			path: route.path,
			body: route.body,
		},
		secret
	);
	opts.headers[HTTP_HEADERS.X_TIMESTAMP] = timestamp;
	opts.headers[HTTP_HEADERS.X_SIGNATURE] = signature;
}
