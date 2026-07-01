import { logger } from '@trading-model/common/config/logger';
import { normalizeError } from '@trading-model/common/utils/errors';

import { IServiceCache } from './service-cache.interface';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface InstanceState {
  failures: number;
  lastFailureTime: number;
  state: CircuitState;
}

interface LatencyWindow {
  samples: number[];
  cursor: number;
  count: number;
}

const MAX_ENTRY_AGE_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;
const DEFAULT_LATENCY_WINDOW_SIZE = 100;
const DEFAULT_LATENCY_P99_THRESHOLD_MS = 5000;
const DEFAULT_LOAD_CACHE_TTL_MS = 2_000;

export class CircuitBreaker {
  private readonly instances = new Map<string, InstanceState>();
  private readonly failureThreshold: number;
  private readonly halfOpenTimeoutMs: number;
  private readonly cooldownMs: number;
  private readonly stateStore?: IServiceCache;
  private readonly loadFromStoreCacheTtlMs: number;
  private readonly lastLoadTimes = new Map<string, number>();
  private readonly latencyWindows = new Map<string, LatencyWindow>();
  private readonly latencyWindowSize: number;
  private readonly latencyP99ThresholdMs: number;
  private sweepHandle?: NodeJS.Timeout;

  constructor(
    failureThreshold = 3,
    halfOpenTimeoutMs = 10_000,
    cooldownMs = 30_000,
    stateStore?: IServiceCache,
    loadFromStoreCacheTtlMs = DEFAULT_LOAD_CACHE_TTL_MS,
    latencyWindowSize = DEFAULT_LATENCY_WINDOW_SIZE,
    latencyP99ThresholdMs = DEFAULT_LATENCY_P99_THRESHOLD_MS
  ) {
    this.failureThreshold = failureThreshold;
    this.halfOpenTimeoutMs = halfOpenTimeoutMs;
    this.cooldownMs = cooldownMs;
    this.stateStore = stateStore;
    this.loadFromStoreCacheTtlMs = loadFromStoreCacheTtlMs;
    this.latencyWindowSize = latencyWindowSize;
    this.latencyP99ThresholdMs = latencyP99ThresholdMs;
    this.sweepHandle = setInterval(() => this.sweepStaleEntries(), SWEEP_INTERVAL_MS);
  }

  async loadFromStore(instanceId: string): Promise<void> {
    if (!this.stateStore) return;

    const lastLoad = this.lastLoadTimes.get(instanceId) ?? 0;
    if (this.loadFromStoreCacheTtlMs > 0 && Date.now() - lastLoad < this.loadFromStoreCacheTtlMs) {
      return;
    }
    this.lastLoadTimes.set(instanceId, Date.now());

    const persisted = await this.stateStore.getCircuitState(instanceId);
    if (persisted) {
      const existing = this.instances.get(instanceId);
      if (!existing || persisted.lastFailureTime > existing.lastFailureTime) {
        this.instances.set(instanceId, {
          failures: persisted.failures,
          lastFailureTime: persisted.lastFailureTime,
          state: persisted.state,
        });
      }
    }
  }

  isAllowed(instanceId: string): boolean {
    const state = this.instances.get(instanceId);
    if (!state || state.state === 'CLOSED') return true;

    if (state.state === 'OPEN') {
      if (Date.now() - state.lastFailureTime >= this.cooldownMs) {
        state.state = 'HALF_OPEN';
        this.persistState(instanceId, state);
        logger.info('Circuit breaker half-open for instance', { instanceId });
        return true;
      }
      return false;
    }

    return true;
  }

  recordFailure(instanceId: string): void {
    const now = Date.now();
    let state = this.instances.get(instanceId);

    if (!state) {
      state = { failures: 0, lastFailureTime: now, state: 'CLOSED' };
      this.instances.set(instanceId, state);
    }

    state.failures++;
    state.lastFailureTime = now;

    if (state.failures >= this.failureThreshold) {
      state.state = 'OPEN';
      logger.warn('Circuit breaker opened for instance', {
        instanceId,
        failures: state.failures,
      });
    }

    this.persistState(instanceId, state);
  }

  recordSuccess(instanceId: string): void {
    const state = this.instances.get(instanceId);
    if (!state) return;

    if (state.state === 'HALF_OPEN') {
      logger.info('Circuit breaker closed for instance', { instanceId });
    }

    // Transition to CLOSED but keep the entry for cross-replica awareness.
    // Deleting would wipe failure history that other replicas rely on.
    state.state = 'CLOSED';
    state.failures = 0;
    this.lastLoadTimes.delete(instanceId);
    this.latencyWindows.delete(instanceId);
    this.deletePersistedState(instanceId);
  }

  isOpen(instanceId: string): boolean {
    return this.instances.get(instanceId)?.state === 'OPEN';
  }

  getState(instanceId: string): CircuitState {
    return this.instances.get(instanceId)?.state ?? 'CLOSED';
  }

  getFailureCount(instanceId: string): number {
    return this.instances.get(instanceId)?.failures ?? 0;
  }

  getStateSummary(): Record<CircuitState, number> {
    const summary: Record<CircuitState, number> = { CLOSED: 0, OPEN: 0, HALF_OPEN: 0 };
    for (const [, state] of this.instances) {
      summary[state.state]++;
    }
    return summary;
  }

  recordLatency(instanceId: string, durationMs: number): void {
    let window = this.latencyWindows.get(instanceId);
    if (!window) {
      window = { samples: new Array(this.latencyWindowSize).fill(0), cursor: 0, count: 0 };
      this.latencyWindows.set(instanceId, window);
    }

    window.samples[window.cursor] = durationMs;
    window.cursor = (window.cursor + 1) % this.latencyWindowSize;
    if (window.count < this.latencyWindowSize) window.count++;

    if (window.count >= 10) {
      const p99 = this.computeP99(window);
      if (p99 > this.latencyP99ThresholdMs) {
        this.recordFailure(instanceId);
        logger.warn('Circuit breaker: latency threshold exceeded, treating as failure', {
          instanceId,
          p99,
          threshold: this.latencyP99ThresholdMs,
        });
      }
    }
  }

  private computeP99(window: LatencyWindow): number {
    const sorted = window.samples.slice(0, window.count).sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.99) - 1;
    return sorted[Math.max(0, idx)];
  }

  clear(): void {
    for (const instanceId of this.instances.keys()) {
      this.deletePersistedState(instanceId);
    }
    this.instances.clear();
    this.lastLoadTimes.clear();
    this.latencyWindows.clear();
    if (this.sweepHandle) {
      clearInterval(this.sweepHandle);
      this.sweepHandle = undefined;
    }
  }

  private sweepStaleEntries(): void {
    const now = Date.now();
    for (const [instanceId, state] of this.instances) {
      if (now - state.lastFailureTime > MAX_ENTRY_AGE_MS) {
        this.instances.delete(instanceId);
        this.lastLoadTimes.delete(instanceId);
        this.latencyWindows.delete(instanceId);
        this.deletePersistedState(instanceId);
      }
    }
  }

  private persistState(instanceId: string, state: InstanceState): void {
    if (!this.stateStore) return;
    this.stateStore
      .setCircuitState(instanceId, {
        failures: state.failures,
        lastFailureTime: state.lastFailureTime,
        state: state.state,
      })
      .catch(err => {
        logger.warn('Failed to persist circuit breaker state', {
          instanceId,
          error: normalizeError(err),
        });
      });
  }

  private deletePersistedState(instanceId: string): void {
    if (!this.stateStore) return;
    this.stateStore.deleteCircuitState(instanceId).catch(err => {
      logger.warn('Failed to delete persisted circuit breaker state', {
        instanceId,
        error: normalizeError(err),
      });
    });
  }
}
