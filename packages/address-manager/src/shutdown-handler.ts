import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/logger";
import {
	removeProcessHandlers,
	setupProcessHandlers,
} from "@trading-model/http/signal-handler";
import type { ShutdownHandlerDeps } from "./types";

/** Stops the address manager on process signals, and removes its signal handlers when asked. */
export class ShutdownHandler {
	private _signalHandlersRegistered = false;
	private _unregistered = false;

	constructor(private readonly _deps: ShutdownHandlerDeps) {}

	shutdown(): void {
		this._deps.registrationManager.stopRetrying();
	}

	/** Leaves the registry (still read by release N-1 peers, ADR-0072). */
	async leaveRegistry(): Promise<void> {
		this.shutdown();
		await this._tryUnregisterService();
	}

	async fullStop(): Promise<void> {
		await this.leaveRegistry();
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
