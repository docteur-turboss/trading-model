import type { HttpClient } from "@trading-model/common/config/http-client";
import {
	type DurationMs,
	URLString,
} from "@trading-model/common/domain/primitives";
import type { KeyPair, KeyPairWithId } from "../types";
import { KeyAlgorithm } from "./generate-key-pair";

function _checkResult<TValue>(result: TValue | undefined | null): TValue {
	if (!result) {
		throw new Error("Empty response from remote signer");
	}
	return result;
}

export class KeyPairClient {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _baseUrl: URLString,
		private readonly _timeoutMs: DurationMs
	) {}

	async generateKeyPair(
		algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
	): Promise<KeyPair> {
		const result = await this._httpClient.post<KeyPair>(
			URLString.of(`${this._baseUrl}/api/v1/crypto/generate-key-pair`),
			{ algorithm },
			{ timeoutMs: this._timeoutMs }
		);
		return _checkResult(result);
	}

	async generateKeyPairWithId(
		algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
	): Promise<KeyPairWithId> {
		const result = await this._httpClient.post<KeyPairWithId>(
			URLString.of(`${this._baseUrl}/api/v1/crypto/generate-key-pair-with-id`),
			{ algorithm },
			{ timeoutMs: this._timeoutMs }
		);
		return _checkResult(result);
	}
}
