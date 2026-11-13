import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { ENV } from "../../infrastructure/config/env";

class SharedHttpClientManager {
	private _httpClient: HttpClient | null = null;

	get(): Promise<HttpClient> {
		if (!this._httpClient) {
			this._httpClient = new HttpClient(buildTlsFromEnv(ENV));
		}
		return Promise.resolve(this._httpClient);
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

export function closeHttpClient(): Promise<void> {
	sharedHttpClient.close();
	return Promise.resolve();
}
