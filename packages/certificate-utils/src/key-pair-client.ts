import type { HttpClient } from "@trading-model/common/config/http-client";
import { KeyAlgorithm } from "./generate-key-pair";
import type { KeyPair, KeyPairWithId } from "./types";
import { guardNonEmptyResponse } from "./remote-signing-client";

export class KeyPairClient {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _baseUrl: string,
		private readonly _timeoutMs: number
	) {}

	async generateKeyPair(
		algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
	): Promise<KeyPair> {
		const result = await this._httpClient.post<KeyPair>(
			`${this._baseUrl}/api/v1/crypto/generate-key-pair`,
			{ algorithm },
			{ timeoutMs: this._timeoutMs }
		);
		return guardNonEmptyResponse(result, "generateKeyPair");
	}

	async generateKeyPairWithId(
		algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
	): Promise<KeyPairWithId> {
		const result = await this._httpClient.post<KeyPairWithId>(
			`${this._baseUrl}/api/v1/crypto/generate-key-pair-with-id`,
			{ algorithm },
			{ timeoutMs: this._timeoutMs }
		);
		return guardNonEmptyResponse(result, "generateKeyPairWithId");
	}
}
