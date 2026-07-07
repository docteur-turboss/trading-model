export class AckTimerManager {
	private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();

	start(jobId: string, ackDeadline: number, onTimeout: () => void): void {
		const remaining = ackDeadline - Date.now();
		const timer = setTimeout(onTimeout, Math.max(remaining, 0));
		this._timers.set(jobId, timer);
	}

	clear(jobId: string): void {
		const timer = this._timers.get(jobId);
		if (timer) {
			clearTimeout(timer);
			this._timers.delete(jobId);
		}
	}

	clearAll(): void {
		for (const [, timer] of this._timers) {
			clearTimeout(timer);
		}
		this._timers.clear();
	}

	get size(): number {
		return this._timers.size;
	}
}
