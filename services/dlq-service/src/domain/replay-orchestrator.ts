import { logger } from '@trading-model/common/config/logger';

/**
 * Pure application orchestration for DLQ replay.
 * Coordinates batch replay with circuit breaking, concurrency control, and timeout handling.
 * No HTTP, no MongoDB, no Redis — receives pre-resolved dependencies.
 */
export class ReplayOrchestrator {
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private circuitFailures = 0;
  private circuitOpenUntil = 0;
  private halfOpenAttempts = 0;
  private activeBatches = 0;

  constructor(
    private readonly circuitThreshold = 5,
    private readonly circuitCooldownMs = 30_000,
    private readonly halfOpenMaxAttempts = 2,
    private readonly maxConcurrentBatches = 2
  ) {}

  /** Check if the circuit allows a request. Returns false if OPEN. */
  canProceed(): boolean {
    if (this.circuitOpenUntil > Date.now()) return false;
    if (this.circuitOpenUntil > 0) {
      this.circuitFailures = 0;
      this.circuitOpenUntil = 0;
      this.halfOpenAttempts = 0;
    }
    return true;
  }

  /** Record the result of a batch replay. */
  recordResult(success: boolean): void {
    if (success) {
      if (this.circuitFailures > 0) this.circuitFailures = 0;
      this.circuitOpenUntil = 0;
      this.halfOpenAttempts = 0;
    } else {
      this.circuitFailures++;
      if (this.circuitOpenUntil > 0) {
        this.halfOpenAttempts++;
        if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
          this.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
          logger.warn('Replay circuit breaker re-opened during half-open', {
            failures: this.circuitFailures,
            halfOpenAttempts: this.halfOpenAttempts,
          });
        }
      }
      if (this.circuitFailures >= this.circuitThreshold) {
        this.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
        logger.warn('Replay circuit breaker opened', {
          failures: this.circuitFailures,
          cooldownMs: this.circuitCooldownMs,
        });
      }
    }
  }

  /** Check if batch concurrency limit has been reached. */
  canStartBatch(): boolean {
    if (this.activeBatches >= this.maxConcurrentBatches) {
      logger.warn('Too many concurrent replay batches', {
        activeBatches: this.activeBatches,
        max: this.maxConcurrentBatches,
      });
      return false;
    }
    return true;
  }

  acquireBatch(): void {
    this.activeBatches++;
  }

  releaseBatch(): void {
    if (this.activeBatches > 0) this.activeBatches--;
  }

  getCircuitState(): string {
    return this.circuitState;
  }
}
