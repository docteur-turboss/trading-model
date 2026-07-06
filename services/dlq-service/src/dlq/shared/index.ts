import { logger } from "../../config/logger";

/**
 * Circuit breaker for message-manager HTTP calls.
 * Duplicated across controller.ts and replay-pipeline.ts — consolidated here.
 */

let mmCircuitFailures = 0;
let mmCircuitOpenUntil = 0;
let mmHalfOpenAttempts = 0;
const MM_CIRCUIT_THRESHOLD = 5;
const MM_CIRCUIT_RESET_MS = 30_000;
const MM_CIRCUIT_HALF_OPEN_MAX_ATTEMPTS = 2;

export function isMMCircuitOpen(): boolean {
	if (mmCircuitOpenUntil > Date.now()) {
		return true;
	}
	if (mmCircuitOpenUntil > 0) {
		mmCircuitFailures = 0;
		mmCircuitOpenUntil = 0;
		mmHalfOpenAttempts = 0;
	}
	return false;
}

export function recordMMResult(success: boolean): void {
	if (success) {
		if (mmCircuitFailures > 0) {
			mmCircuitFailures = 0;
		}
		mmCircuitOpenUntil = 0;
		mmHalfOpenAttempts = 0;
	} else {
		mmCircuitFailures++;
		if (mmCircuitOpenUntil > 0) {
			mmHalfOpenAttempts++;
			if (mmHalfOpenAttempts >= MM_CIRCUIT_HALF_OPEN_MAX_ATTEMPTS) {
				mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
				logger.warn(
					"Message-manager circuit breaker re-opened during half-open",
					{
						failures: mmCircuitFailures,
						halfOpenAttempts: mmHalfOpenAttempts,
						resetMs: MM_CIRCUIT_RESET_MS,
					}
				);
			}
		}
		if (mmCircuitFailures >= MM_CIRCUIT_THRESHOLD) {
			mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
			logger.warn("Message-manager circuit breaker opened", {
				failures: mmCircuitFailures,
				resetMs: MM_CIRCUIT_RESET_MS,
			});
		}
	}
}

/**
 * HTTP client singleton management.
 */

import { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { findAService } from "../../config/address-manager";
import { env } from "../../config/env";

let httpClient: HttpClient | null = null;
let httpClientPromise: Promise<HttpClient> | null = null;

async function getHttpClient(): Promise<HttpClient> {
	if (httpClient) {
		return httpClient;
	}
	const existingClient =
		httpClientPromise === null ? null : await httpClientPromise;
	if (existingClient) {
		return existingClient;
	}

	httpClientPromise = (() => {
		const client = new HttpClient({
			ca: env.TLS_CA_PATH,
			cert: env.TLS_CERT_PATH,
			key: env.TLS_KEY_PATH,
		});
		httpClient = client;
		return Promise.resolve(client);
	})();

	return httpClientPromise;
}

export { getHttpClient };

export async function reloadHttpClientTls(): Promise<void> {
	const client = httpClient as { reloadTlsPaths?: () => Promise<void> } | null;
	if (client && typeof client.reloadTlsPaths === "function") {
		try {
			await client.reloadTlsPaths();
			logger.info("HTTP client TLS certificates reloaded");
		} catch (err) {
			logger.error("Failed to reload HTTP client TLS certificates", {
				error: (err as Error).message,
			});
		}
	}
}

export function closeHttpClient(): Promise<void> {
	httpClient = null;
	httpClientPromise = null;
	return Promise.resolve();
}

export async function resolveMessageManagerUrl(): Promise<string | null> {
	let url: string | null = env.MESSAGE_MANAGER_URL ?? null;
	if (!url) {
		try {
			const target = await findAService(
				ServiceInstanceName.MessageDeliveryService
			);
			if (target) {
				url = `https://${target.ip}:${target.port}`;
			}
		} catch {
			logger.warn("DLQ address-manager resolution failed");
		}
	}
	return url;
}

/**
 * Active replays counter.
 */

export class ActiveReplayCounter {
	private _count = 0;
	get count(): number {
		return this._count;
	}
	increment(): void {
		this._count++;
	}
	decrement(): void {
		if (this._count > 0) {
			this._count--;
		}
	}
}

export const activeReplays = new ActiveReplayCounter();

/**
 * Shutdown flag.
 */

let shuttingDown = false;

export function setShuttingDown(value: boolean): void {
	shuttingDown = value;
}

export function isShuttingDown(): boolean {
	return shuttingDown;
}
