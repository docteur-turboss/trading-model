import { MemoryStoreAdapter } from "@trading-model/persistence/memory-store-adapter";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import type {
	DurationMs,
	InstanceId,
} from "@trading-model/primitives/primitives";
import { CircuitBreaker } from "@trading-model/reliability/circuit-breaker";
import type { CircuitBreakerConfig } from "@trading-model/reliability/circuit-state-machine";
import { CircuitBreakerPersistence } from "../../adapters/outbound/discovery/circuit-breaker-persistence";
import {
	DEFAULT_FAILURE_THRESHOLD,
	DEFAULT_HALF_OPEN_TIMEOUT_MS,
	DEFAULT_LATENCY_P99_THRESHOLD_MS,
	DEFAULT_LATENCY_WINDOW_SIZE,
	DEFAULT_LOAD_CACHE_TTL_MS,
} from "../../domain/discovery/circuit-breaker-constants";
import type { ICircuitStateStore } from "../../domain/discovery/circuit-state-store.interface";
import type { PersistedCircuitState } from "../../domain/discovery/service-cache.interface";
import { STALE_OPEN_MS } from "../../infrastructure/discovery/circuit-breaker-sweeper";
import {
	CIRCUIT_BREAKER_STATE,
	recordCircuitState,
} from "../../infrastructure/metrics";
import { CircuitBreakerPersistenceHandler } from "./circuit-breaker-persistence-handler";

export interface CircuitBreakerOptions {
	failureThreshold?: number;
	halfOpenTimeoutMs?: number;
	stateStore?: ICircuitStateStore;
	loadFromStoreCacheTtlMs?: number;
	latencyWindowSize?: number;
	latencyP99ThresholdMs?: number;
}

function resolveStateStore(
	stateStore?: ICircuitStateStore
): ICircuitStateStore {
	if (stateStore) {
		return stateStore;
	}
	const defaultAdapter = new MemoryStoreAdapter<PersistedCircuitState>();
	return {
		setCircuitState: (id, state) => defaultAdapter.set(id, state),
		getCircuitState: (id) => defaultAdapter.get(id),
		deleteCircuitState: (id) => defaultAdapter.delete(id),
	};
}

function buildCircuitConfig(
	failureThreshold: number,
	halfOpenTimeoutMs: number
): Partial<CircuitBreakerConfig> & { cooldownMs: DurationMs } {
	return {
		failureThreshold,
		cooldownMs: halfOpenTimeoutMs as DurationMs,
		halfOpenMaxAttempts: 1,
	};
}

export class DiscoveryCircuitBreaker extends CircuitBreaker {
	private readonly _persistenceHandler: CircuitBreakerPersistenceHandler;
	private readonly _halfOpenTimeoutMs: number;
	/** Last time each key was consulted or fed; lets the sweeper expire machines of vanished instances. */
	private readonly _lastActivity = new Map<string, number>();

	constructor(options: CircuitBreakerOptions = {}) {
		const failureThreshold =
			options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
		const halfOpenTimeoutMs =
			options.halfOpenTimeoutMs ?? DEFAULT_HALF_OPEN_TIMEOUT_MS;
		const loadFromStoreCacheTtlMs =
			options.loadFromStoreCacheTtlMs ?? DEFAULT_LOAD_CACHE_TTL_MS;
		const latencyWindowSize =
			options.latencyWindowSize ?? DEFAULT_LATENCY_WINDOW_SIZE;
		const latencyP99ThresholdMs =
			options.latencyP99ThresholdMs ?? DEFAULT_LATENCY_P99_THRESHOLD_MS;
		const persistence = new CircuitBreakerPersistence(
			resolveStateStore(options.stateStore),
			loadFromStoreCacheTtlMs
		);

		super(buildCircuitConfig(failureThreshold, halfOpenTimeoutMs), {
			latencyWindowSize,
			latencyP99ThresholdMs,
		});

		this._halfOpenTimeoutMs = halfOpenTimeoutMs;
		this._persistenceHandler = new CircuitBreakerPersistenceHandler(
			persistence,
			halfOpenTimeoutMs
		);
		this._persistenceHandler.startSweeper(
			(fn) => this.forEachMachine(fn),
			(key) => this.removeMachine(key),
			(key) => Date.now() - (this._lastActivity.get(key) ?? 0) > STALE_OPEN_MS
		);
	}

	async loadFromStore(instanceId: InstanceId): Promise<void> {
		const persisted = await this._persistenceHandler.loadFromStore(instanceId);
		if (persisted) {
			const machine = this.getMachine(instanceId);
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
			this._reportState(instanceId);
		}
	}

	/** Consulted by discovery before handing out an instance: also publishes open to half-open. */
	isOpen(instanceId: InstanceId): boolean {
		const open = super.isOpen(instanceId);
		this._reportState(instanceId);
		return open;
	}

	isAllowed(instanceId: InstanceId): boolean {
		const machine = this.getMachine(instanceId);
		const currentState = machine.getState(Date.now());
		this._reportState(instanceId, currentState);
		return currentState !== CircuitState.OPEN;
	}

	recordSuccess(instanceId: InstanceId): void {
		const machine = this.getMachine(instanceId);
		super.recordSuccess(instanceId);
		this._persistenceHandler.onRecordSuccess(instanceId, machine);
		this._reportState(instanceId);
	}

	recordFailure(
		instanceId: InstanceId,
		count?: number,
		threshold?: number
	): boolean {
		const machine = this.getMachine(instanceId);
		const opened = machine.recordFailure(count ?? 1, threshold);
		this._persistenceHandler.onRecordFailure(instanceId, machine, opened);
		this._reportState(instanceId);
		return opened;
	}

	removeMachine(key: string): void {
		super.removeMachine(key);
		this._lastActivity.delete(key);
		CIRCUIT_BREAKER_STATE.remove({ instanceId: key });
	}

	private _reportState(
		instanceId: InstanceId,
		state: CircuitState = this.getState(instanceId)
	): void {
		this._lastActivity.set(instanceId, Date.now());
		recordCircuitState(instanceId, state, this.getStateSummary());
	}

	clear(): void {
		this._lastActivity.clear();
		CIRCUIT_BREAKER_STATE.reset();
		this._persistenceHandler.clear((fn) =>
			this.forEachMachine((key) => fn(key))
		);
		super.clear();
	}

	stop(): void {
		this._persistenceHandler.stop();
	}
}
