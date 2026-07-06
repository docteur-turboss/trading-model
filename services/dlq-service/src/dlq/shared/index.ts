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
		_resetMMCircuit();
	} else {
		_recordMMFailure();
	}
}

function _resetMMCircuit(): void {
	if (mmCircuitFailures > 0) {
		mmCircuitFailures = 0;
	}
	mmCircuitOpenUntil = 0;
	mmHalfOpenAttempts = 0;
}

function _recordMMFailure(): void {
	mmCircuitFailures++;
	_checkHalfOpenReopen();
	_checkThresholdOpen();
}

function _checkHalfOpenReopen(): void {
	if (mmCircuitOpenUntil <= 0) {
		return;
	}
	mmHalfOpenAttempts++;
	if (mmHalfOpenAttempts >= MM_CIRCUIT_HALF_OPEN_MAX_ATTEMPTS) {
		mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
		logger.warn("Message-manager circuit breaker re-opened during half-open", {
			failures: mmCircuitFailures,
			halfOpenAttempts: mmHalfOpenAttempts,
			resetMs: MM_CIRCUIT_RESET_MS,
		});
	}
}

function _checkThresholdOpen(): void {
	if (mmCircuitFailures < MM_CIRCUIT_THRESHOLD) {
		return;
	}
	mmCircuitOpenUntil = Date.now() + MM_CIRCUIT_RESET_MS;
	logger.warn("Message-manager circuit breaker opened", {
		failures: mmCircuitFailures,
		resetMs: MM_CIRCUIT_RESET_MS,
	});
}

/**
 * HTTP client singleton management.
 */

import { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { findAService } from "../../config/address-manager";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

class SharedHttpClientManager {
	private _httpClient!: HttpClient;

	async get(): Promise<HttpClient> {
		this._httpClient = new HttpClient({
			ca: env.TLS_CA_PATH,
			cert: env.TLS_CERT_PATH,
			key: env.TLS_KEY_PATH,
		});
		return this._httpClient;
	}

	async reloadTls(): Promise<void> {
		const client = this._httpClient as { reloadTlsPaths?: () => Promise<void> };
		if (typeof client.reloadTlsPaths === "function") {
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

	close(): void {
	}
}

const sharedHttpClient = new SharedHttpClientManager();

export async function getHttpClient(): Promise<HttpClient> {
	return sharedHttpClient.get();
}

export async function reloadHttpClientTls(): Promise<void> {
	return sharedHttpClient.reloadTls();
}

export async function closeHttpClient(): Promise<void> {
	sharedHttpClient.close();
}

export async function resolveMessageManagerUrl(): Promise<string | null> {
	let url: string | null = env.MESSAGE_MANAGER_URL ?? null;
	if (!url) {
		url = await _resolveViaAddressManager();
	}
	return url;
}

async function _resolveViaAddressManager(): Promise<string | null> {
	try {
		const target = await findAService(
			ServiceInstanceName.MessageDeliveryService
		);
		if (target) {
			return `https://${target.ip}:${target.port}`;
		}
	} catch {
		logger.warn("DLQ address-manager resolution failed");
	}
	return null;
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
