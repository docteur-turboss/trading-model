import { DurationMs } from "../domain/primitives";
import { TimerHandle } from "../utils/timer-handle";

export class AckTimerManager {
	private readonly _timers = new Map<string, TimerHandle>();

	start(jobId: string, ackDeadline: number, onTimeout: () => void): void {
		const handle = new TimerHandle();
		handle.startTimeout(
			onTimeout,
			DurationMs.of(Math.max(ackDeadline - Date.now(), 0))
		);
		this._timers.set(jobId, handle);
	}

	clear(jobId: string): void {
		const handle = this._timers.get(jobId);
		if (handle) {
			handle.stop();
			this._timers.delete(jobId);
		}
	}

	clearAll(): void {
		for (const [, handle] of this._timers) {
			handle.stop();
		}
		this._timers.clear();
	}

	get size(): number {
		return this._timers.size;
	}
}
