import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type {
	DurationMs,
	InstanceId,
} from "@trading-model/common/domain/primitives";
import { MemoryStoreAdapter } from "@trading-model/common/persistence/index";
import { CircuitBreaker } from "@trading-model/common/reliability/circuit-breaker";
import type { CircuitBreakerConfig } from "@trading-model/common/reliability/circuit-state-machine";
import {
	DEFAULT_LATENCY_P99_THRESHOLD_MS,
	DEFAULT_LATENCY_WINDOW_SIZE,
	DEFAULT_LOAD_CACHE_TTL_MS,
} from "./circuit-breaker-constants";
import { CircuitBreakerPersistence } from "./circuit-breaker-persistence";
import { CircuitBreakerPersistenceHandler } from "./circuit-breaker-persistence-handler";
import type { ICircuitStateStore } from "./circuit-state-store.interface";
import { buildStateSummary } from "./circuit-state-summary";
import type { PersistedCircuitState } from "./service-cache.interface";

export interface CircuitBreakerOptions {
	failureThreshold?: number;
	halfOpenTimeoutMs?: number;
	stateStore?: ICircuitStateStore;
	loadFromStoreCacheTtlMs?: number;
	latencyWindowSize?: number;
	latencyP99ThresholdMs?: number;
}

export class DiscoveryCircuitBreaker extends CircuitBreaker {
	private readonly _persistenceHandler: CircuitBreakerPersistenceHandler;
	private readonly _halfOpenTimeoutMs: number;

	constructor(options: CircuitBreakerOptions = {}) {
		const failureThreshold = options.failureThreshold ?? 3;
		const halfOpenTimeoutMs = options.halfOpenTimeoutMs ?? 10_000;
		const defaultAdapter = new MemoryStoreAdapter<PersistedCircuitState>();
		const stateStore: ICircuitStateStore = options.stateStore ?? {
			setCircuitState: (id, state) => defaultAdapter.set(id, state),
			getCircuitState: (id) => defaultAdapter.get(id),
			deleteCircuitState: (id) => defaultAdapter.delete(id),
		};
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
		this._persistenceHandler = new CircuitBreakerPersistenceHandler(
			persistence,
			halfOpenTimeoutMs
		);
		this._persistenceHandler.startSweeper(
			(fn) => this.forEachMachine(fn),
			(key) => this.removeMachine(key)
		);
	}

	async loadFromStore(instanceId: InstanceId): Promise<void> {
		const persisted = await this._persistenceHandler.loadFromStore(instanceId);
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
		super.recordSuccess(instanceId as unknown as string);
		this._persistenceHandler.onRecordSuccess(instanceId, machine);
	}

	recordFailure(
		instanceId: InstanceId,
		count?: number,
		threshold?: number
	): boolean {
		const opened = this.getMachine(
			instanceId as unknown as string
		).recordFailure(count ?? 1, threshold);
		const machine = this.getMachine(instanceId as unknown as string);
		this._persistenceHandler.onRecordFailure(instanceId, machine, opened);
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

	getStateSummary(): Record<string, number> {
		return buildStateSummary((fn) => this.forEachMachine(fn));
	}

	clear(): void {
		this._persistenceHandler.clear((fn) =>
			this.forEachMachine((key) => fn(key))
		);
		super.clear();
	}

	stop(): void {
		this._persistenceHandler.stop();
	}
}
