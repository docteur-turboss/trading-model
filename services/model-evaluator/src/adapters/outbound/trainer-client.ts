import https from "node:https";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { buildHttpsAgentOptions } from "@trading-model/http/infrastructure/http-tls-loader";
import { URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { ModelManifest } from "../../domain/model-evaluation";

const WEIGHTS_TIMEOUT_MS = 60_000;

/** Reads the trainer's versioned model API (ADR-0022): manifest, then weights. */
export class TrainerClient {
	private readonly _http: HttpClient;

	constructor(private readonly _tls: TlsPaths) {
		this._http = HttpClient.createWithTls(_tls);
	}

	private async _base(): Promise<string> {
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.TraderTrainerService
		);
		if (!target) {
			throw new Error("trader-trainer is not registered in discovery");
		}
		return `https://${HostPort.toAddress(target)}`;
	}

	async manifest(symbol: string, version: string): Promise<ModelManifest> {
		const url = URLString.of(
			`${await this._base()}/models/${symbol}/${version}`
		);
		const body = await this._http.get(
			url,
			undefined,
			z.object({ data: ModelManifest })
		);
		if (!body) {
			throw new Error(`Empty manifest answer for ${symbol}/${version}`);
		}
		return body.data;
	}

	/** Raw weights and the `x-model-sha256` header (the JSON client reads neither). */
	async weights(
		symbol: string,
		version: string
	): Promise<{ bytes: Buffer; sha256: string | undefined }> {
		const url = new URL(
			`${await this._base()}/models/${symbol}/${version}/weights`
		);
		return await new Promise((resolve, reject) => {
			const req = https.get(
				url,
				{ ...buildHttpsAgentOptions(this._tls), timeout: WEIGHTS_TIMEOUT_MS },
				(res) => {
					const chunks: Buffer[] = [];
					res.on("data", (chunk: Buffer) => chunks.push(chunk));
					res.on("error", reject);
					res.on("end", () => {
						if (res.statusCode !== 200) {
							reject(
								new Error(
									`Weights of ${symbol}/${version}: HTTP ${res.statusCode}`
								)
							);
							return;
						}
						const header = res.headers["x-model-sha256"];
						resolve({
							bytes: Buffer.concat(chunks),
							sha256: Array.isArray(header) ? header[0] : header,
						});
					});
				}
			);
			req.on("timeout", () =>
				req.destroy(new Error("Weights download timed out"))
			);
			req.on("error", reject);
		});
	}
}
