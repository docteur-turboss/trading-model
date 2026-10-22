import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import type { IHeartbeatSender } from "@trading-model/reliability/heartbeat-interfaces";
import type { AddressManagerClient } from "../adapters/outbound/client/address-manager-client";
import { HeartbeatFailureHandler } from "./heartbeat-failure-handler";
import type { ServiceClientDeps } from "./types";

export class HeartbeatManager implements IHeartbeatSender {
	private _addressManagerClient: AddressManagerClient;
	private _onSuccess: () => void;
	private readonly _failureHandler: HeartbeatFailureHandler;

	constructor(deps: ServiceClientDeps) {
		this._addressManagerClient = deps.addressManagerClient;
		this._onSuccess = deps.onSuccess ?? (() => {});
		this._failureHandler = new HeartbeatFailureHandler(deps);
	}

	async sendHeartbeat(_identity: ServiceIdentity): Promise<void> {
		await this._heartbeatViaHttp();
	}

	private async _heartbeatViaHttp(): Promise<void> {
		try {
			await this._addressManagerClient.refreshTTL();
			this._onSuccess();
			this._failureHandler.resetFailures();
		} catch (err) {
			await this._failureHandler.handleError(err, this._onSuccess);
		}
	}
}
