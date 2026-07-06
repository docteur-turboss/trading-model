import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { logger } from "../../config/logger";
import type { WalDrainCoordinator } from "./wal-drain-coordinator";
import type { WalFlushLoop } from "./wal-flush-loop";

export class WalFlushManager {
	private _walFlushing = false;
	private readonly _walFlusherTimer = new TimerHandle();

	constructor(
		private readonly _flushLoop: WalFlushLoop,
		private readonly _drainCoordinator: WalDrainCoordinator
	) {}

	start(): void {
		this._walFlusherTimer.startInterval(() => {
			this.flush().catch(() => {});
		}, 1000);
		this._walFlusherTimer.unref();
	}

	stop(): void {
		this._walFlusherTimer.stop();
	}

	async flush(): Promise<void> {
		if (this._walFlushing) {
			return this._drainCoordinator.enqueueFlushWaiter();
		}
		this._walFlushing = true;
		try {
			await this._flushLoop.drainAll();
		} catch (err) {
			logger.error("WAL flush error", {
				context: { error: (err as Error).message },
			});
		} finally {
			this._completeWalFlush();
		}
	}

	private _completeWalFlush(): void {
		this._walFlushing = false;
		this._drainCoordinator.resolveDrain();
		this._drainCoordinator.notifyWaiters();
	}
}
