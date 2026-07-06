import { createHmac } from "node:crypto";

import type { HttpClient } from "@trading-model/common/config/http-client";
import type { HttpRequestOptions } from "@trading-model/common/config/http-types";
import type { HttpRoute, Signature, SignedRequest, SignedRequestAuth, Timestamp } from "@trading-model/common/contracts/signed-request";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";
import {
	messageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { MESSAGES_DLQ_ERROR_TOTAL } from "../../config/metrics";
import type { DlqEntry } from "./dlq-repository";
import { DlqSendHandler } from "./dlq-send-handler";

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

function signRequest(
	input: SignRequestInput
): SignedRequestAuth {
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
	const parts = [input.serviceName, input.timestamp, deterministicStringify(normalizeBody(input.body)), input.method, input.path].join(":");
	return createHmac("sha256", buf).update(parts).digest("hex");
}

function warnAndSkip(timestamp: Timestamp): SignedRequestAuth {
	logger.warn("DLQ HMAC secret is too short or empty — requests will not be signed");
	return { timestamp, signature: "" as Signature };
}

interface SignedOptionsInput extends HttpRoute {
	body: unknown;
	extra?: Partial<HttpRequestOptions>;
}

function signedOptions(
	input: SignedOptionsInput
): HttpRequestOptions {
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
		headers: { [HTTP_HEADERS.X_SERVICE_NAME]: "message-manager", ...(extra?.headers ?? {}) },
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

export interface DlqSendOptions {
	attempt?: number;
	maxRetries?: number;
}

export interface IDlqServiceClient {
	readonly isEnabled: boolean;
	send(entry: DlqEntry, options?: DlqSendOptions): Promise<void>;
	replay(topic?: string, limit?: number): Promise<DlqEntry[]>;
	delete(entryIds: string[]): Promise<void>;
}

class NullDlqServiceClient implements IDlqServiceClient {
	readonly isEnabled = false;

	async send(entry: DlqEntry, _options?: DlqSendOptions): Promise<void> {
		this._logNotConfigured(entry);
	}

	private _logNotConfigured(entry: DlqEntry): void {
		logger.warn("DLQ Service not configured, dropping dead letter entry", { context: {
			reason: entry.reason,
		} });
		MESSAGES_DLQ_ERROR_TOTAL.inc({ target: "not-configured" });
	}

	async replay(_topic?: string, _limit?: number): Promise<DlqEntry[]> {
		return [];
	}

	async delete(_entryIds: string[]): Promise<void> {
		// no-op
	}
}

export class DlqServiceClient implements IDlqServiceClient {
	private readonly _httpClient: HttpClient;
	private readonly _sendHandler: DlqSendHandler;
	private readonly _serviceUrl: string;

	constructor(httpClient: HttpClient) {
		this._httpClient = httpClient;
		this._serviceUrl = ENV.DLQ_SERVICE_URL || "";
		this._sendHandler = new DlqSendHandler(this._httpClient, this._serviceUrl);
	}

	get isEnabled(): boolean {
		return Boolean(this._serviceUrl);
	}

	async send(entry: DlqEntry, options?: DlqSendOptions): Promise<void> {
		if (!this.isEnabled) {
			return;
		}
		const attempt = options?.attempt ?? 1;
		const maxRetries = options?.maxRetries ?? 3;
		try {
			await this._sendHandler.doSend(entry);
		} catch (err) {
			return this._sendHandler.handleSendError(entry, err as Error, attempt, maxRetries);
		}
	}

	async replay(topic?: string, limit = 100): Promise<DlqEntry[]> {
		if (!this.isEnabled) {
			return [];
		}
		try {
			const url = this._sendHandler.buildReplayUrl(topic, limit);
			const result = await this._httpClient.get<{ entries: DlqEntry[] }>(
				url,
				signedOptions({ method: "GET", path: "/dlq", body: undefined, extra: { timeoutMs: 5000 } })
			);
			return result?.entries ?? [];
		} catch (err) {
			logger.error("Failed to fetch DLQ entries for replay", { context: {
				error: normalizeError(err as Error),
			} });
			return [];
		}
	}

	async delete(entryIds: string[]): Promise<void> {
		if (!this.isEnabled) {
			return;
		}
		const body = { ids: entryIds };

		try {
			await this._httpClient.post(
				`${this._serviceUrl}/dlq/delete`,
				body,
				signedOptions({ method: "POST", path: "/dlq/delete", body, extra: { timeoutMs: 5000 } })
			);
		} catch (err) {
			logger.error("Failed to delete DLQ entries", { context: {
				error: normalizeError(err as Error),
			} });
		}
	}
}

export function createDlqServiceClient(httpClient: HttpClient): IDlqServiceClient {
	const url = ENV.DLQ_SERVICE_URL || "";
	if (!url) {
		return new NullDlqServiceClient();
	}
	return new DlqServiceClient(httpClient);
}
