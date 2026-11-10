import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { HttpMethod } from "@trading-model/contracts/signed-request";
import { buildSignedHeaders } from "@trading-model/crypto/application/services/request-signer";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { isHttpClientError } from "@trading-model/http/adapters/outbound/http-client-errors";
import {
	DurationMs,
	ServiceId,
	type URLString,
} from "@trading-model/primitives/primitives";
import type { DeadLetterStorePort } from "../../domain/ports/dead-letter-store.port";

const DLQ_PATH = "/dlq";
const REQUEST_TIMEOUT_MS = DurationMs.of(5000);

/** Name dlq-service knows message-manager by (`DLQ_ALLOWED_SERVICES`). */
const CALLER = ServiceId.of("message-manager");

export interface HttpDeadLetterStoreOptions {
	httpClient: HttpClient;
	/** `POST /dlq` URL of a dlq-service instance. */
	resolveUrl: () => Promise<URLString>;
	/** `DLQ_AUTH_HMAC_SECRET`, shared with dlq-service. */
	secret: string;
}

/**
 * Stores dead letters in dlq-service (`POST /dlq`, signed request), where the
 * DLQ API lists and replays them.
 */
export class HttpDeadLetterStore implements DeadLetterStorePort {
	constructor(private readonly _options: HttpDeadLetterStoreOptions) {
		// signRequest returns an empty signature below 16 characters.
		if (_options.secret.length < 16) {
			throw new Error("DLQ_AUTH_HMAC_SECRET must be at least 16 characters");
		}
	}

	async insert(entry: DlqEntry): Promise<void> {
		// Sign exactly what dlq-service will parse: the JSON form of the entry.
		const body = JSON.parse(JSON.stringify(entry)) as unknown;
		const headers = buildSignedHeaders(
			{ serviceName: CALLER, method: HttpMethod.Post, path: DLQ_PATH, body },
			this._options.secret
		);
		await this._options.httpClient.post(
			await this._options.resolveUrl(),
			body,
			{ headers, timeoutMs: REQUEST_TIMEOUT_MS }
		);
	}
}

/**
 * dlq-service will never accept this entry (invalid or too large): sending it
 * again cannot help. Authentication failures are not permanent: they are
 * fixed by configuration.
 */
export function isPermanentRejection(err: unknown): boolean {
	return (
		isHttpClientError(err) &&
		(err.statusCode === HTTP_STATUS.BAD_REQUEST ||
			err.statusCode === HTTP_STATUS.PAYLOAD_TOO_LARGE)
	);
}
