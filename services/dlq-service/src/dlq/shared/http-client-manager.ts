import { HttpClient } from "@trading-model/common/config/http-client";
import { buildTlsFromEnv } from "@trading-model/common/domain/tls-paths";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";

class SharedHttpClientManager {
	private _httpClient: HttpClient | null = null;

	get(): Promise<HttpClient> {
		if (!this._httpClient) {
			this._httpClient = new HttpClient(buildTlsFromEnv(ENV));
		}
		return this._httpClient;
	}

	async reloadTls(): Promise<void> {
		if (!this._httpClient) {
			return;
		}
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

	/** HttpClient manages its own request lifecycle — no persistent connections to tear down. */
	close(): void {
		this._httpClient = null;
	}
}

const sharedHttpClient = new SharedHttpClientManager();

export function getHttpClient(): Promise<HttpClient> {
	return sharedHttpClient.get();
}

export function reloadHttpClientTls(): Promise<void> {
	return sharedHttpClient.reloadTls();
}

export function closeHttpClient(): Promise<void> {
	sharedHttpClient.close();
}
