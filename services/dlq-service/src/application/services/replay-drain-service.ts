import { logger } from "../../config/logger";
import { STALE_CLAIM_MS } from "../../domain/dlq-constants";
import { activeReplays } from "../../shared/active-replay-counter";

const DRAIN_TIMEOUT_MS = 10_000;

function _sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref();
	});
}

export class ReplayDrainService {
	/**
	 * Waits for the replay batches in flight. False when some still run: their
	 * claims must then stay, since message-manager may still be publishing
	 * those entries; they are released as stale once `STALE_CLAIM_MS` passed.
	 */
	async drain(): Promise<boolean> {
		if (activeReplays.count === 0) {
			return true;
		}

		logger.info(
			`Waiting for ${activeReplays.count} in-flight replays to complete`
		);
		const deadline = Date.now() + DRAIN_TIMEOUT_MS;
		while (activeReplays.count > 0 && Date.now() < deadline) {
			await _sleep(100);
		}
		if (activeReplays.count === 0) {
			return true;
		}

		logger.warn(
			`${activeReplays.count} replays did not complete within drain timeout — their claims are released as stale after ${STALE_CLAIM_MS} ms`
		);
		return false;
	}
}
