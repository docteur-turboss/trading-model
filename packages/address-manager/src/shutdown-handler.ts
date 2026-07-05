import type { IServiceCache } from "./discovery/service-cache.interface";
import type { CircuitBreaker } from "./discovery/circuit-breaker";
import type { WebSocketClient } from "./client/websocket-client";
import type { AddressManagerClient } from "./client/address-manager-client";

export class ShutdownHandler {
	private _cleanupHandlers?: () => void;
	private _metricsTimer?: NodeJS.Timeout;

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

	setMetricsTimer(timer: NodeJS.Timeout | undefined): void {
		this._metricsTimer = timer;
	}

	setCleanupHandlers(fn: () => void): void {
		this._cleanupHandlers = fn;
	}

	shutdown(): void {
		this._registrationManager.shouldRetryRegistration = false;
		this._registrationManager.resolveStopRegistration();
	}

	async fullStop(): Promise<void> {
		this.shutdown();

		if (this._wsClient) {
			this._wsClient.disconnect();
		}

		try {
			await this._addressManagerClient.unregisterService();
		} catch {
			/* best-effort */
		}

		this._serviceCache.stop();
		this._circuitBreaker.clear();

		if (this._metricsTimer) {
			clearInterval(this._metricsTimer);
			this._metricsTimer = undefined;
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
			this._cleanupHandlers = undefined;
		};
	}

	removeSignalHandlers(): void {
		this._cleanupHandlers?.();
	}
}
