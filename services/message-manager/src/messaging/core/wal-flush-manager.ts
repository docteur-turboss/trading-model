import { toDurationMs } from "@trading-model/common/domain/primitives";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { logger } from "../../config/logger";
import type { WalDrainCoordinator } from "./wal-drain-coordinator";
import type { WalFlushLoop } from "./wal-flush-loop";

export class WalFlushManager {
	private readonly _flushImpl: () => Promise<void>;
	private readonly _walFlusherTimer = new TimerHandle();

	constructor(
		private readonly _flushLoop: WalFlushLoop,
		private readonly _drainCoordinator: WalDrainCoordinator
	) {
		let walFlushing = false;
		this._flushImpl = async () => {
			if (walFlushing) {
				return this._drainCoordinator.enqueueFlushWaiter();
			}
			walFlushing = true;
			try {
				await this._flushLoop.drainAll();
			} catch (err) {
				logger.error("WAL flush error", {
					context: { error: (err as Error).message },
				});
			} finally {
				walFlushing = false;
				this._drainCoordinator.resolveDrain();
				this._drainCoordinator.notifyWaiters();
			}
		};
	}

	start(): void {
		this._walFlusherTimer.startInterval(() => {
			this.flush().catch(() => {});
		}, toDurationMs(1000));
		this._walFlusherTimer.unref();
	}

	stop(): void {
		this._walFlusherTimer.stop();
	}

	flush(): Promise<void> {
		return this._flushImpl();
	}
}
