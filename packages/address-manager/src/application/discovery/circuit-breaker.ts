import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type {
	DurationMs,
	InstanceId,
} from "@trading-model/common/domain/primitives";
import { MemoryStoreAdapter } from "@trading-model/common/persistence/index";
import { CircuitBreaker } from "@trading-model/common/reliability/circuit-breaker";
import type { CircuitBreakerConfig } from "@trading-model/common/reliability/circuit-state-machine";
import { CircuitBreakerPersistence } from "../../adapters/outbound/discovery/circuit-breaker-persistence";
import {
	DEFAULT_LATENCY_P99_THRESHOLD_MS,
	DEFAULT_LATENCY_WINDOW_SIZE,
	DEFAULT_LOAD_CACHE_TTL_MS,
} from "../../domain/discovery/circuit-breaker-constants";
import type { ICircuitStateStore } from "../../domain/discovery/circuit-state-store.interface";
import type { PersistedCircuitState } from "../../domain/discovery/service-cache.interface";
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

	constructor(options: CircuitBreakerOptions = {}) {
		const failureThreshold = options.failureThreshold ?? 3;
		const halfOpenTimeoutMs = options.halfOpenTimeoutMs ?? 10_000;
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
