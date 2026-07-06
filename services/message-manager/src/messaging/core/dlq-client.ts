import { createHmac } from "node:crypto";

import type { HttpClient } from "@trading-model/common/config/http-client";
import type { HttpRequestOptions } from "@trading-model/common/config/http-types";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";
import {
	AppError,
	messageManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { MESSAGES_DLQ_ERROR_TOTAL } from "../../config/metrics";
import type { DqlEntry as DlqEntry } from "./dlq-repository";

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

interface SignRequestInput {
	serviceName: string;
	method: string;
	path: string;
	body: unknown;
	secretBuf?: Buffer;
}

function signRequest({
	serviceName,
	method,
	path,
	body,
	secretBuf,
}: SignRequestInput): { timestamp: string; signature: string } {
	const timestamp = String(Date.now());
	const buf = secretBuf ?? getHmacSecretBuffer();
	try {
		if (buf.length < 16) {
			return warnAndSkip(timestamp);
		}
		return {
			timestamp,
			signature: computeSignature(serviceName, timestamp, method, path, body, buf),
		};
	} finally {
		buf.fill(0);
	}
}

function computeSignature(
	serviceName: string,
	timestamp: string,
	method: string,
	path: string,
	body: unknown,
	buf: Buffer
): string {
	const parts = [serviceName, timestamp, deterministicStringify(normalizeBody(body)), method, path].join(":");
	return createHmac("sha256", buf).update(parts).digest("hex");
}

function warnAndSkip(timestamp: string): { timestamp: string; signature: string } {
	logger.warn("DLQ HMAC secret is too short or empty — requests will not be signed");
	return { timestamp, signature: "" };
}

interface SignedOptionsInput {
	method: string;
	path: string;
	body: unknown;
	extra?: Partial<HttpRequestOptions>;
}

function signedOptions({
	method,
	path,
	body,
	extra,
}: SignedOptionsInput): HttpRequestOptions {
	const opts = buildBaseOptions(extra);
	const secretBuf = getHmacSecretBuffer();
	if (secretBuf.length >= 16) {
		addSignature(opts, method, path, body, secretBuf);
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
	method: string,
	path: string,
	body: unknown,
	secretBuf: Buffer
): void {
	const { timestamp, signature } = signRequest({
		serviceName: "message-manager",
		method,
		path,
		body,
		secretBuf,
	});
	opts.headers["x-timestamp"] = timestamp;
	opts.headers["x-signature"] = signature;
}

export class DlqServiceClient {
	private _httpClient: HttpClient;
	private _serviceUrl: string;

	constructor(httpClient: HttpClient) {
		this._httpClient = httpClient;
		this._serviceUrl = ENV.DLQ_SERVICE_URL || "";
	}

	get isEnabled(): boolean {
		return Boolean(this._serviceUrl);
	}

	async send(entry: DlqEntry, attempt = 1, MaxRetries = 3): Promise<void> {
		if (!this.isEnabled) {
			this._logNotConfigured(entry);
			return;
		}

		try {
			await this._doSend(entry);
		} catch (err) {
			return this._handleSendError(entry, err as Error, attempt, MaxRetries);
		}
	}

	private _logNotConfigured(entry: DlqEntry): void {
		logger.warn("DLQ Service not configured, dropping dead letter entry", { context: {
			reason: entry.reason,
		} });
		MESSAGES_DLQ_ERROR_TOTAL.inc({ target: "not-configured" });
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
		MaxRetries: number
	): Promise<void> {
		if (attempt <= MaxRetries) {
			await this._retrySend(entry, err, attempt, MaxRetries);
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
		MaxRetries: number
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
		return this.send(entry, attempt + 1, MaxRetries);
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
