import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { HttpClient } from "@trading-model/http/http-client";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { Intent } from "../../domain/decision";

const Result = z.object({
	status: z.string(),
	clientOrderId: z.string(),
	reason: z.string().optional(),
});
export type IntentResult = z.infer<typeof Result>;

/** Sends intents to risk-execution with the SVID of the service; it holds no other power over it. */
export class RiskClient {
	private readonly _http: HttpClient;

	constructor(tls: TlsPaths) {
		this._http = HttpClient.createWithTls(tls);
	}

	/** A rejection is a result (`status: "rejected"`); a transport error or a 4xx throws. */
	async send(intent: Intent, signal?: AbortSignal): Promise<IntentResult> {
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.RiskExecutionService
		);
		const result = await this._http.post(
			URLString.of(`https://${HostPort.toAddress(target)}/intents`),
			Intent.parse(intent),
			{ serviceName: ServiceId.of("risk-execution"), signal },
			Result
		);
		if (!result) {
			throw new Error(`Empty answer to intent ${intent.decisionId}`);
		}
		return result;
	}
}
