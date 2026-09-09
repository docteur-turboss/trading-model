import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import {
	removeProcessHandlers,
	setupProcessHandlers,
} from "@trading-model/server-utils/infrastructure/signal-handler";
import type { ShutdownHandlerDeps } from "../domain/types";

export class ShutdownHandler {
	private readonly _metricsTimer = new TimerHandle();
	private _signalHandlersRegistered = false;

	constructor(private readonly _deps: ShutdownHandlerDeps) {}

	shutdown(): void {
		this._deps.registrationManager.stopRetrying();
	}

	async fullStop(): Promise<void> {
		this.shutdown();
		this._disconnectWs();
		await this._tryUnregisterService();
		this._deps.serviceCache.close();
		this._deps.circuitBreaker.clear();
		this._metricsTimer.stop();
	}

	private _disconnectWs(): void {
		this._deps.wsClient?.disconnect();
	}

	private async _tryUnregisterService(): Promise<void> {
		try {
			await this._deps.addressManagerClient.unregisterService();
		} catch {}
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
