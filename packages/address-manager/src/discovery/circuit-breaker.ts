import { logger } from "@trading-model/common/config/logger";
import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type {
	DurationMs,
	InstanceId,
} from "@trading-model/common/domain/primitives";
import { MemoryStoreAdapter } from "@trading-model/common/persistence/index";
import { CircuitBreaker } from "@trading-model/common/reliability/circuit-breaker";
import type { CircuitBreakerConfig } from "@trading-model/common/reliability/circuit-state-machine";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import {
	DEFAULT_LATENCY_P99_THRESHOLD_MS,
	DEFAULT_LATENCY_WINDOW_SIZE,
	DEFAULT_LOAD_CACHE_TTL_MS,
} from "./circuit-breaker-constants";
import { CircuitBreakerPersistence } from "./circuit-breaker-persistence";
import type { ICircuitStateStore } from "./circuit-state-store.interface";
import type { PersistedCircuitState } from "./service-cache.interface";

export interface CircuitBreakerOptions {
	failureThreshold?: number;
	halfOpenTimeoutMs?: number;
	stateStore?: ICircuitStateStore;
	loadFromStoreCacheTtlMs?: number;
	latencyWindowSize?: number;
	latencyP99ThresholdMs?: number;
}

const SWEEP_INTERVAL_MS = 60_000;

export class CircuitBreakerSweeper {
	private readonly _handle = new TimerHandle();

	start(sweepFn: () => void): void {
		this._handle.startInterval(sweepFn, SWEEP_INTERVAL_MS);
		this._handle.unref();
	}

	stop(): void {
		this._handle.stop();
	}
}

export class DiscoveryCircuitBreaker extends CircuitBreaker {
	private readonly _persistence: CircuitBreakerPersistence;
	private readonly _sweeper: CircuitBreakerSweeper;
	private readonly _halfOpenTimeoutMs: number;

	constructor(options: CircuitBreakerOptions = {}) {
		const failureThreshold = options.failureThreshold ?? 3;
		const halfOpenTimeoutMs = options.halfOpenTimeoutMs ?? 10_000;
		const stateStore: ICircuitStateStore =
			options.stateStore ??
			(new MemoryStoreAdapter<PersistedCircuitState>() as unknown as ICircuitStateStore);
		const loadFromStoreCacheTtlMs =
			options.loadFromStoreCacheTtlMs ?? DEFAULT_LOAD_CACHE_TTL_MS;
		const latencyWindowSize =
			options.latencyWindowSize ?? DEFAULT_LATENCY_WINDOW_SIZE;
		const latencyP99ThresholdMs =
			options.latencyP99ThresholdMs ?? DEFAULT_LATENCY_P99_THRESHOLD_MS;

		const config: Partial<CircuitBreakerConfig> & { cooldownMs: DurationMs } = {
			failureThreshold,
			cooldownMs: halfOpenTimeoutMs as DurationMs,
			halfOpenMaxAttempts: 1,
		};

		const persistence = new CircuitBreakerPersistence(
			stateStore,
			loadFromStoreCacheTtlMs
		);

		super(config, {
			latencyWindowSize,
			latencyP99ThresholdMs,
			onPersist: (key, machine) => {
				const instanceId = key as unknown as InstanceId;
				persistence.persistMachineState(instanceId, machine, halfOpenTimeoutMs);
			},
			onClear: (key) => {
				persistence.deletePersistedState(key as unknown as InstanceId);
			},
		});

		this._halfOpenTimeoutMs = halfOpenTimeoutMs;
		this._persistence = persistence;
		this._sweeper = new CircuitBreakerSweeper();

		this._sweeper.start(() => this._sweep());
	}

	private _sweep(): void {
		const now = Date.now();
		const toRemove: string[] = [];
		this.forEachMachine((key, machine) => {
			if (
				machine.getState(now) === CircuitState.CLOSED &&
				machine.failures === 0
			) {
				toRemove.push(key);
			}
		});
		for (const key of toRemove) {
			this.removeMachine(key);
		}
	}

	async loadFromStore(instanceId: InstanceId): Promise<void> {
		const persisted = await this._persistence.loadFromStore(instanceId);
		if (persisted) {
			const machine = this.getMachine(instanceId as unknown as string);
			if (machine.failures >= persisted.failures) {
				return;
			}
			machine.restore({
				failures: persisted.failures,
				openUntil:
					persisted.state === CircuitState.OPEN
						? persisted.lastFailureTime + this._halfOpenTimeoutMs
						: 0,
				halfOpenAttempts: persisted.state === CircuitState.HALF_OPEN ? 1 : 0,
			});
		}
	}

	isAllowed(instanceId: InstanceId): boolean {
		const machine = this.getMachine(instanceId as unknown as string);
		const currentState = machine.getState(Date.now());
		if (currentState === CircuitState.CLOSED) {
			return true;
		}
		if (currentState === CircuitState.OPEN) {
			return false;
		}
		return true;
	}

	recordSuccess(instanceId: InstanceId): void {
		const machine = this.getMachine(instanceId as unknown as string);
		const snap = machine.snapshot();
		if (snap.openUntil > 0) {
			logger.info("Circuit breaker closed for instance", { instanceId });
		}
		super.recordSuccess(instanceId as unknown as string);
		this._persistence.deletePersistedState(instanceId);
		this._persistence.invalidateCache(instanceId);
	}

	recordFailure(
		instanceId: InstanceId,
		count?: number,
		threshold?: number
	): boolean {
		const opened = this.getMachine(
			instanceId as unknown as string
		).recordFailure(count ?? 1, threshold);
		if (opened) {
			logger.warn("Circuit breaker opened for instance", {
				instanceId,
				failures: this.getMachine(instanceId as unknown as string).failures,
			});
		}
		const machine = this.getMachine(instanceId as unknown as string);
		this._persistence.persistMachineState(
			instanceId,
			machine,
			this._halfOpenTimeoutMs
		);
		return opened;
	}

	getState(instanceId: InstanceId): CircuitState {
		return this.getMachine(instanceId as unknown as string).getState(
			Date.now()
		);
	}

	getFailureCount(instanceId: InstanceId): number {
		return this.getMachine(instanceId as unknown as string).failures;
	}

	isOpen(instanceId: InstanceId): boolean {
		return this.getMachine(instanceId as unknown as string).isOpen(Date.now());
	}

	call<TResult>(
		instanceId: InstanceId,
		fn: () => Promise<TResult>,
		fallback?: () => TResult
	): Promise<TResult> {
		return super.call(instanceId as unknown as string, fn, fallback);
	}

	getStateSummary(): Record<CircuitState, number> {
		const now = Date.now();
		const summary: Record<string, number> = {
			closed: 0,
			open: 0,
			"half-open": 0,
		};
		this.forEachMachine((_key, machine) => {
			summary[machine.getState(now)]++;
		});
		return summary as Record<CircuitState, number>;
	}

	clear(): void {
		this.forEachMachine((key) => {
			this._persistence.deletePersistedState(key as unknown as InstanceId);
		});
		super.clear();
		this._persistence.clear();
		this._sweeper.stop();
	}

	stop(): void {
		this._sweeper.stop();
	}
}
