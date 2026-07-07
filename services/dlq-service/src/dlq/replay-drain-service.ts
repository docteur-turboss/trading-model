import { logger } from "../config/logger";
import { dlqClaimManager } from "./claim-manager";
import { activeReplays } from "./shared/active-replay-counter";

function _sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref();
	});
}

export class ReplayDrainService {
	async drain(): Promise<void> {
		if (activeReplays.count === 0) return;

		logger.info(
			`Waiting for ${activeReplays.count} in-flight replays to complete`
		);
		await this._waitForReplays();

		if (activeReplays.count === 0) return;

		await this._forceReleaseClaims();
	}

	private async _waitForReplays(): Promise<void> {
		const drainTimeout = 10_000;
		const deadline = Date.now() + drainTimeout;
		while (activeReplays.count > 0 && Date.now() < deadline) {
			await _sleep(100);
		}
	}

	private async _forceReleaseClaims(): Promise<void> {
		logger.warn(
			`${activeReplays.count} replays did not complete within drain timeout — releasing their claims`
		);
		await dlqClaimManager.releaseAllActiveClaims();
		await _sleep(500);
		await dlqClaimManager.releaseAllActiveClaims();
	}
}
