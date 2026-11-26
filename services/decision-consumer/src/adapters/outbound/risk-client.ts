import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { Intent } from "@trading-model/contracts/order-intent";
import { HttpClient } from "@trading-model/http/http-client";
import {
	DurationMs,
	ServiceId,
	URLString,
} from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { FIND_A_SERVICE } from "../../config/address-manager";

const Result = z.object({
	status: z.string(),
	clientOrderId: z.string(),
	reason: z.string().optional(),
});
const Position = z.object({ quantity: z.number().min(0) });
export type IntentResult = z.infer<typeof Result>;

/** Sends intents to risk-execution with the SVID of the service; it holds no other power over it. */
export class RiskClient {
	private readonly _http: HttpClient;

	constructor(tls: TlsPaths) {
		this._http = HttpClient.createWithTls(tls);
	}

	/** Real paper position of `symbol` (0 when flat); a transport error or a 4xx throws. */
	async position(symbol: string, signal?: AbortSignal): Promise<number> {
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.RiskExecutionService
		);
		const result = await this._http.get(
			URLString.of(
				`https://${HostPort.toAddress(target)}/positions/${encodeURIComponent(symbol)}`
			),
			{ serviceName: ServiceId.of("risk-execution"), signal },
			Position
		);
		if (!result) {
			throw new Error(`Empty answer to position ${symbol}`);
		}
		return result.quantity;
	}

	/** A rejection is a result (`status: "rejected"`); a transport error or a 4xx throws. */
	async send(intent: Intent, signal?: AbortSignal): Promise<IntentResult> {
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.RiskExecutionService
		);
		const result = await this._http.post(
			URLString.of(`https://${HostPort.toAddress(target)}/intents`),
			Intent.parse(intent),
			{
				serviceName: ServiceId.of("risk-execution"),
				signal,
				// A replay after a lost answer would come back as a false duplicate; the next pass retries with the same decisionId.
				retryCount: 0,
				timeoutMs: DurationMs.of(5_000),
			},
			Result
		);
		if (!result) {
			throw new Error(`Empty answer to intent ${intent.decisionId}`);
		}
		return result;
	}
}
