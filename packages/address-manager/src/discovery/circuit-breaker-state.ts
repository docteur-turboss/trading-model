import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import { logger } from "@trading-model/common/config/logger";

export interface INstanceState {
	failures: number;
	lastFailureTime: number;
	state: CircuitState;
}

const MAX_ENTRY_AGE_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;

export class CircuitBreakerState {
	private readonly _instances = new Map<string, INstanceState>();
	private _sweepHandle?: NodeJS.Timeout;

	constructor(
		private readonly _failureThreshold: number,
		private readonly _halfOpenTimeoutMs: number,
		private readonly _onSweepInstance?: (instanceId: string) => void,
	) {
		this._startSweeper();
	}

	getOrCreateState(instanceId: string, now: number): INstanceState {
		let state = this._instances.get(instanceId);
		if (!state) {
			state = { failures: 0, lastFailureTime: now, state: "closed" };
			this._instances.set(instanceId, state);
		}
		return state;
	}

	checkOpenThreshold(instanceId: string, state: INstanceState): void {
		if (state.failures >= this._failureThreshold) {
			state.state = "open";
			logger.warn("Circuit breaker opened for instance", {
				instanceId,
				failures: state.failures,
			});
		}
	}

	tryHalfOpen(instanceId: string, state: INstanceState): boolean {
		if (Date.now() - state.lastFailureTime >= this._halfOpenTimeoutMs) {
			state.state = "half-open";
			logger.info("Circuit breaker half-open for instance", { instanceId });
			return true;
		}
		return false;
	}

	logHalfOpenClose(instanceId: string, state: INstanceState): void {
		if (state.state === "half-open") {
			logger.info("Circuit breaker closed for instance", { instanceId });
		}
	}

	getInstanceState(instanceId: string): INstanceState | undefined {
		return this._instances.get(instanceId);
	}

	get instances(): Map<string, INstanceState> {
		return this._instances;
	}

	clear(): void {
		this._instances.clear();
		this._stopSweeper();
	}

	stop(): void {
		this._stopSweeper();
	}

	private _startSweeper(): void {
		this._sweepHandle = setInterval(() => this._sweepStaleEntries(), SWEEP_INTERVAL_MS);
		this._sweepHandle.unref();
	}

	private _sweepStaleEntries(): void {
		const now = Date.now();
		for (const [instanceId, state] of this._instances) {
			if (now - state.lastFailureTime > MAX_ENTRY_AGE_MS) {
				this._instances.delete(instanceId);
				this._onSweepInstance?.(instanceId);
			}
		}
	}

	private _stopSweeper(): void {
		if (this._sweepHandle) {
			clearInterval(this._sweepHandle);
			this._sweepHandle = undefined;
		}
	}
}
