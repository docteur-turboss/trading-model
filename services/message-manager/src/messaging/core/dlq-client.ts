import { createHmac } from "node:crypto";

import type {
	HttpClient,
	HttpRequestOptions,
} from "@trading-model/common/config/http-client";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";
import {
	AppError,
	MessageManagerError,
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
	const parts = [
		serviceName,
		timestamp,
		deterministicStringify(normalizeBody(body)),
		method,
		path,
	].join(":");
	const buf = secretBuf ?? getHmacSecretBuffer();
	try {
		if (buf.length < 16) {
			logger.warn(
				"DLQ HMAC secret is too short or empty — requests will not be signed"
			);
			return { timestamp, signature: "" };
		}
		const signature = createHmac("sha256", buf).update(parts).digest("hex");
		return { timestamp, signature };
	} finally {
		buf.fill(0);
	}
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
	const opts: HttpRequestOptions & { headers: Record<string, string> } = {
		timeoutMs: 5000,
		...extra,
		headers: { "x-service-name": "message-manager", ...(extra?.headers ?? {}) },
	};
	const secretBuf = getHmacSecretBuffer();
	if (secretBuf.length >= 16) {
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
	return opts;
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
			logger.warn("DLQ Service not configured, dropping dead letter entry", { context: {
				reason: entry.reason,
			} });
			MESSAGES_DLQ_ERROR_TOTAL.inc({ target: "not-configured" });
			return;
		}

		try {
			await this._httpClient.post(
				`${this._serviceUrl}/dlq`,
				entry,
				signedOptions({ method: "POST", path: "/dlq", body: entry, extra: { timeoutMs: 5000 } })
			);
			logger.info("DLQ entry sent to DLQ service", { context: { reason: entry.reason } });
		} catch (err) {
			if (attempt <= MaxRetries) {
				const delay = Math.round(
					Math.min(200 * 2 ** (attempt - 1), 5000) * (0.5 + Math.random() * 0.5)
				);
				logger.warn("Retrying DLQ send after error", { context: {
					attempt,
					delay,
					reason: entry.reason,
					error: normalizeError(err as Error),
				} });
				await new Promise((resolve) => setTimeout(resolve, delay));
				return this.send(entry, attempt + 1, MaxRetries);
			}
			logger.error("Failed to send DLQ entry to service after retries", { context: {
				error: normalizeError(err as Error),
				reason: entry.reason,
			} });
			throw new MessageManagerError(
				"Failed to send DLQ entry",
				{
					cause: err,
				}
			);
		}
	}

	async replay(topic?: string, limit = 100): Promise<DlqEntry[]> {
		if (!this.isEnabled) {
			return [];
		}

		try {
			const params = new URLSearchParams();
			if (topic) {
				params.set("topic", topic);
			}
			params.set("limit", limit.toString());
			const result = await this._httpClient.get<{ entries: DlqEntry[] }>(
				`${this._serviceUrl}/dlq?${params.toString()}`,
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
