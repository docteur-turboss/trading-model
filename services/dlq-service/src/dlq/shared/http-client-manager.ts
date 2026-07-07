import { HttpClient } from "@trading-model/common/config/http-client";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";

class SharedHttpClientManager {
	private _httpClient: HttpClient | null = null;

	async get(): Promise<HttpClient> {
		if (!this._httpClient) {
			this._httpClient = new HttpClient({
				ca: ENV.TLS_CA_PATH,
				cert: ENV.TLS_CERT_PATH,
				key: ENV.TLS_KEY_PATH,
			});
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

export async function getHttpClient(): Promise<HttpClient> {
	return sharedHttpClient.get();
}

export async function reloadHttpClientTls(): Promise<void> {
	return sharedHttpClient.reloadTls();
}

export async function closeHttpClient(): Promise<void> {
	sharedHttpClient.close();
}
