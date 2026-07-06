import { setupProcessHandlers, removeProcessHandlers } from "@trading-model/common/server/signal-handler";
import type { IServiceCache } from "./discovery/service-cache.interface";
import type { CircuitBreaker } from "./discovery/circuit-breaker";
import type { WebSocketClient } from "./client/websocket-client";
import type { AddressManagerClient } from "./client/address-manager-client";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

export class ShutdownHandler {
	private readonly _metricsTimer = new TimerHandle();
	private _signalHandlersRegistered = false;

	constructor(
		private readonly _registrationManager: {
			shouldRetryRegistration: boolean;
		},
		private readonly _wsClient: WebSocketClient | undefined,
		private readonly _addressManagerClient: AddressManagerClient,
		private readonly _serviceCache: IServiceCache,
		private readonly _circuitBreaker: CircuitBreaker
	) {}

	shutdown(): void {
		this._registrationManager.shouldRetryRegistration = false;
	}

	async fullStop(): Promise<void> {
		this.shutdown();
		this._disconnectWs();
		await this._unregisterService();
		this._serviceCache.stop();
		this._circuitBreaker.clear();
		this._metricsTimer.stop();
	}

	private _disconnectWs(): void {
		this._wsClient?.disconnect();
	}

	private async _unregisterService(): Promise<void> {
		try {
			await this._addressManagerClient.unregisterService();
		} catch {
			/* best-effort */
		}
	}

	setupSignalHandlers(scheduler: { stop: () => void }): void {
		if (this._signalHandlersRegistered) {
			return;
		}
		this._signalHandlersRegistered = true;
		setupProcessHandlers(
			async () => {
				scheduler.stop();
				await this.fullStop();
			},
			() => {
				process.exitCode = 1;
			},
		);
	}

	removeSignalHandlers(): void {
		if (this._signalHandlersRegistered) {
			removeProcessHandlers();
			this._signalHandlersRegistered = false;
		}
	}
}
