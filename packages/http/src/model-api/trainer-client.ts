import https from "node:https";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { HttpClient } from "../http-client";
import { buildHttpsAgentOptions } from "../http-tls-loader";

/** Total deadline of a weights download (an upstream that trickles bytes must not hold it open). */
const WEIGHTS_TIMEOUT_MS = 60_000;
/** Above the largest expected weights file: the body is buffered in memory. */
const WEIGHTS_MAX_BYTES = 256 * 1024 * 1024;

/** Reads the trainer's versioned model API (ADR-0022): manifest, then weights. */
const TRAINER = ServiceId.of("trader-trainer");

export class TrainerClient<Manifest> {
	private readonly _http: HttpClient;

	/** `manifest` is the part of the trainer manifest the caller relies on. */
	constructor(
		private readonly _tls: TlsPaths,
		private readonly _find: (name: ServiceInstanceName) => Promise<HostPort>,
		private readonly _manifest: z.ZodType<Manifest>
	) {
		this._http = HttpClient.createWithTls(_tls);
	}

	private async _base(): Promise<string> {
		const target = await this._find(ServiceInstanceName.TraderTrainerService);
		return `https://${HostPort.toAddress(target)}`;
	}

	async manifest(
		symbol: string,
		version: string,
		signal?: AbortSignal
	): Promise<Manifest> {
		const url = URLString.of(
			`${await this._base()}/models/${symbol}/${version}`
		);
		const body = await this._http.get(
			url,
			{ serviceName: TRAINER, signal },
			z.object({ data: this._manifest })
		);
		if (!body) {
			throw new Error(`Empty manifest answer for ${symbol}/${version}`);
		}
		return body.data;
	}

	/** Raw weights and the `x-model-sha256` header (the JSON client reads neither). */
	async weights(
		symbol: string,
		version: string,
		signal?: AbortSignal
	): Promise<{ bytes: Buffer; sha256: string | undefined }> {
		const url = new URL(
			`${await this._base()}/models/${symbol}/${version}/weights`
		);
		return await new Promise((resolve, reject) => {
			const req = https.get(
				url,
				{
					...buildHttpsAgentOptions(this._tls, TRAINER),
					signal: AbortSignal.any([
						AbortSignal.timeout(WEIGHTS_TIMEOUT_MS),
						...(signal ? [signal] : []),
					]),
				},
				(res) => {
					const chunks: Buffer[] = [];
					let bytes = 0;
					res.on("data", (chunk: Buffer) => {
						bytes += chunk.length;
						if (bytes > WEIGHTS_MAX_BYTES) {
							req.destroy(
								new Error(`Weights larger than ${WEIGHTS_MAX_BYTES} bytes`)
							);
							return;
						}
						chunks.push(chunk);
					});
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
			req.on("error", reject);
		});
	}
}
