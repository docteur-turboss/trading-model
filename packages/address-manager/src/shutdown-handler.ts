import type { IServiceCache } from "./discovery/service-cache.interface";
import type { CircuitBreaker } from "./discovery/circuit-breaker";
import type { WebSocketClient } from "./client/websocket-client";
import type { AddressManagerClient } from "./client/address-manager-client";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

export class ShutdownHandler {
	private _cleanupHandlers: () => void = () => {};
	private readonly _metricsTimer = new TimerHandle();

	constructor(
		private readonly _registrationManager: {
			shouldRetryRegistration: boolean;
			resolveStopRegistration: () => void;
		},
		private readonly _wsClient: WebSocketClient | undefined,
		private readonly _addressManagerClient: AddressManagerClient,
		private readonly _serviceCache: IServiceCache,
		private readonly _circuitBreaker: CircuitBreaker
	) {}

	setCleanupHandlers(fn: () => void): void {
		this._cleanupHandlers = fn;
	}

	shutdown(): void {
		this._registrationManager.shouldRetryRegistration = false;
		this._registrationManager.resolveStopRegistration();
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
		const onSigTerm = async () => {
			scheduler.stop();
			await this.fullStop();
		};

		const onSigInt = async () => {
			await onSigTerm();
		};

		process.on("SIGTERM", onSigTerm);
		process.on("SIGINT", onSigInt);

		this._cleanupHandlers = () => {
			process.removeListener("SIGTERM", onSigTerm);
			process.removeListener("SIGINT", onSigInt);
			this._cleanupHandlers = () => {};
		};
	}

	removeSignalHandlers(): void {
		this._cleanupHandlers();
	}
}
