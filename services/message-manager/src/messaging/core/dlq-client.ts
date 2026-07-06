import { createHmac } from "node:crypto";

import type { HttpClient } from "@trading-model/common/config/http-client";
import type { HttpRequestOptions } from "@trading-model/common/config/http-types";
import type { HttpRoute, SignedRequest, SignedRequestAuth } from "@trading-model/common/contracts/signed-request";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";
import {
	AppError,
	messageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { MESSAGES_DLQ_ERROR_TOTAL } from "../../config/metrics";
import type { DlqEntry } from "./dlq-repository";

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
	const timestamp = String(Date.now());
	const buf = input.secretBuf ?? getHmacSecretBuffer();
	try {
		if (buf.length < 16) {
			return warnAndSkip(timestamp);
		}
		return {
			timestamp,
			signature: computeSignature({ ...input, timestamp }, buf),
		};
	} finally {
		buf.fill(0);
	}
}

function computeSignature(
	input: SignedRequest & { timestamp: string },
	buf: Buffer
): string {
	const parts = [input.serviceName, input.timestamp, deterministicStringify(normalizeBody(input.body)), input.method, input.path].join(":");
	return createHmac("sha256", buf).update(parts).digest("hex");
}

function warnAndSkip(timestamp: string): SignedRequestAuth {
	logger.warn("DLQ HMAC secret is too short or empty — requests will not be signed");
	return { timestamp, signature: "" };
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
		headers: { "x-service-name": "message-manager", ...(extra?.headers ?? {}) },
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
	opts.headers["x-timestamp"] = timestamp;
	opts.headers["x-signature"] = signature;
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
	private _httpClient: HttpClient;
	private readonly _serviceUrl: string;

	constructor(httpClient: HttpClient) {
		this._httpClient = httpClient;
		this._serviceUrl = ENV.DLQ_SERVICE_URL || "";
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
			await this._doSend(entry);
		} catch (err) {
			return this._handleSendError(entry, err as Error, attempt, maxRetries);
		}
	}

	private async _doSend(entry: DlqEntry): Promise<void> {
		await this._httpClient.post(
			`${this._serviceUrl}/dlq`,
			entry,
			signedOptions({ method: "POST", path: "/dlq", body: entry, extra: { timeoutMs: 5000 } })
		);
		logger.info("DLQ entry sent to DLQ service", { context: { reason: entry.reason } });
	}

	private async _handleSendError(
		entry: DlqEntry,
		err: Error,
		attempt: number,
		maxRetries: number
	): Promise<void> {
		if (attempt <= maxRetries) {
			await this._retrySend(entry, err, attempt, maxRetries);
			return;
		}
		logger.error("Failed to send DLQ entry to service after retries", { context: {
			error: normalizeError(err),
			reason: entry.reason,
		} });
		throw messageManagerError("Failed to send DLQ entry", { cause: err });
	}

	private async _retrySend(
		entry: DlqEntry,
		err: Error,
		attempt: number,
		maxRetries: number
	): Promise<void> {
		const delay = Math.round(
			Math.min(200 * 2 ** (attempt - 1), 5000) * (0.5 + Math.random() * 0.5)
		);
		logger.warn("Retrying DLQ send after error", { context: {
			attempt,
			delay,
			reason: entry.reason,
			error: normalizeError(err),
		} });
		await new Promise((resolve) => setTimeout(resolve, delay));
		return this.send(entry, { attempt: attempt + 1, maxRetries });
	}

	async replay(topic?: string, limit = 100): Promise<DlqEntry[]> {
		if (!this.isEnabled) {
			return [];
		}
		try {
			const url = this._buildReplayUrl(topic, limit);
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

	private _buildReplayUrl(topic?: string, limit = 100): string {
		const params = new URLSearchParams();
		if (topic) {
			params.set("topic", topic);
		}
		params.set("limit", limit.toString());
		return `${this._serviceUrl}/dlq?${params.toString()}`;
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
