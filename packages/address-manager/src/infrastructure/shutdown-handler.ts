import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { logger } from "@trading-model/http/infrastructure/logger";
import {
	removeProcessHandlers,
	setupProcessHandlers,
} from "@trading-model/server-utils/infrastructure/signal-handler";
import type { ShutdownHandlerDeps } from "../application/types";

export class ShutdownHandler {
	private readonly _metricsTimer = new TimerHandle();
	private _signalHandlersRegistered = false;
	private _unregistered = false;

	constructor(private readonly _deps: ShutdownHandlerDeps) {}

	shutdown(): void {
		this._deps.registrationManager.stopRetrying();
	}

	/**
	 * Leaves the registry but keeps discovering other services: callers stop
	 * being routed here while in-flight work still resolves its targets.
	 */
	async leaveRegistry(): Promise<void> {
		this.shutdown();
		await this._tryUnregisterService();
	}

	async fullStop(): Promise<void> {
		await this.leaveRegistry();
		this._deps.serviceCache.close();
		this._deps.circuitBreaker.clear();
		this._metricsTimer.stop();
	}

	private async _tryUnregisterService(): Promise<void> {
		if (this._unregistered) {
			return;
		}
		this._unregistered = true;
		try {
			await this._deps.addressManagerClient.unregisterService();
		} catch (err) {
			// Shutdown continues: the registry evicts the instance once its TTL lapses.
			logger.warn("Failed to unregister service on shutdown", {
				error: normalizeError(err),
			});
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
