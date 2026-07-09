import { logger } from "../../config/logger";
import type { MemoryWalBuffer } from "./memory-wal-buffer";
import type { WalDrainCoordinator } from "./wal-drain-coordinator";

export class WalShutdownDrainer {
	constructor(
		private readonly _drainCoordinator: WalDrainCoordinator,
		private readonly _memoryWalBuffer: MemoryWalBuffer
	) {}

	async drainWalWithDeadline(deadline: number): Promise<void> {
		try {
			const remaining = deadline - Date.now();
			if (remaining > 0) {
				await this._drainCoordinator.drain(remaining);
			}
		} catch (err) {
			logger.warn("WAL drain failed during shutdown", {
				context: { error: (err as Error).message },
			});
		}
	}

	async drainMemoryWithDeadline(deadline: number): Promise<void> {
		while (this._memoryWalBuffer.length > 0) {
			if (Date.now() >= deadline) {
				logger.warn("Memory WAL drain timed out", {
					context: { remaining: this._memoryWalBuffer.length },
				});
				break;
			}
			try {
				await this._memoryWalBuffer.drainAll();
			} catch {
				break;
			}
		}
	}
}
