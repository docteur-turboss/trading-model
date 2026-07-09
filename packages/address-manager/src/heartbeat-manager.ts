import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { AddressManagerClient } from "./client/address-manager-client";
import { HeartbeatFailureHandler } from "./heartbeat-failure-handler";
import type { AddressManagerDeps } from "./types";

interface WsHeartbeatClient {
	readonly isConnected: boolean;
	connect(): void;
	sendHeartbeat(identity: ServiceIdentity): boolean;
	updateToken(token: string): void;
}

export class HeartbeatManager {
	private _addressManagerClient: AddressManagerClient;
	private _wsClient: WsHeartbeatClient | undefined;
	private _onSuccess: () => void;
	private readonly _failureHandler: HeartbeatFailureHandler;

	constructor(deps: AddressManagerDeps) {
		this._addressManagerClient = deps.addressManagerClient;
		this._wsClient = deps.wsClient;
		this._onSuccess = deps.onSuccess ?? (() => {});
		this._failureHandler = new HeartbeatFailureHandler(deps);
	}

	async sendHeartbeat(identity: ServiceIdentity): Promise<void> {
		if (this._heartbeatViaWs(identity)) {
			return;
		}
		await this._heartbeatViaHttp();
	}

	private _heartbeatViaWs(identity: ServiceIdentity): boolean {
		if (this._wsClient?.isConnected) {
			const sent = this._wsClient.sendHeartbeat(identity);
			if (sent) {
				this._onSuccess();
				this._failureHandler.resetFailures();
				return true;
			}
		}
		return false;
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
