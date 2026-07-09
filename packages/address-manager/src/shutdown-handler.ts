import {
	removeProcessHandlers,
	setupProcessHandlers,
} from "@trading-model/common/server/signal-handler";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { ShutdownHandlerDeps } from "./types";

export class ShutdownHandler {
	private readonly _metricsTimer = new TimerHandle();
	private _signalHandlersRegistered = false;

	constructor(private readonly _deps: ShutdownHandlerDeps) {}

	shutdown(): void {
		this._deps.registrationManager.shouldRetryRegistration = false;
	}

	async fullStop(): Promise<void> {
		this.shutdown();
		this._disconnectWs();
		await this._unregisterService();
		this._deps.serviceCache.stop();
		this._deps.circuitBreaker.clear();
		this._metricsTimer.stop();
	}

	private _disconnectWs(): void {
		this._deps.wsClient?.disconnect();
	}

	private async _unregisterService(): Promise<void> {
		try {
			await this._deps.addressManagerClient.unregisterService();
		} catch {
			// no-op — best-effort unregistration
		}
	}

	setupSignalHandlers(scheduler: { stop: () => void }): void {
		if (this._signalHandlersRegistered) {
			return;
		}
		this._signalHandlersRegistered = true;
		setupProcessHandlers(
			() => this._onGracefulShutdown(scheduler),
			() => {
				process.exitCode = 1;
			}
		);
	}

	private async _onGracefulShutdown(scheduler: {
		stop: () => void;
	}): Promise<void> {
		scheduler.stop();
		await this.fullStop();
	}

	removeSignalHandlers(): void {
		if (this._signalHandlersRegistered) {
			removeProcessHandlers();
			this._signalHandlersRegistered = false;
		}
	}
}
