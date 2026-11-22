import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { HttpClient } from "@trading-model/http/http-client";
import { ModelManifestSchema } from "@trading-model/model-runtime/model-manifest";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import { z } from "zod";
import { FIND_A_SERVICE } from "../../config/address-manager";
import type { AdmissionPort } from "../../domain/ports";

const Manifest = z.object({
	data: ModelManifestSchema.pick({ admission: true }),
});

/** Reads `admission.admissible` of the model manifest from the trainer (ADR-0069); absent means not admissible. */
export class TrainerAdmission implements AdmissionPort {
	private readonly _http: HttpClient;

	constructor(tls: TlsPaths) {
		this._http = HttpClient.createWithTls(tls);
	}

	async isAdmissible(symbol: string, version: string): Promise<boolean> {
		const target = await FIND_A_SERVICE(
			ServiceInstanceName.TraderTrainerService
		);
		const url = URLString.of(
			`https://${HostPort.toAddress(target)}/models/${encodeURIComponent(symbol)}/${encodeURIComponent(version)}`
		);
		const body = await this._http.get(
			url,
			{ serviceName: ServiceId.of("trader-trainer") },
			Manifest
		);
		return body?.data.admission?.admissible === true;
	}
}
