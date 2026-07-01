import { Redis } from 'ioredis';

const LOCK_PREFIX = 'dlq:lock:';
const LOCK_TTL = 30; // Seconds — auto-release if process crashes

export class DistributedLock {
  private renewalInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redis: Redis,
    private readonly lockName: string
  ) {}

  private get key(): string {
    return `${LOCK_PREFIX}${this.lockName}`;
  }

  async acquire(instanceId: string): Promise<boolean> {
    const acquired = await this.redis.set(
      this.key,
      instanceId,
      'EX',
      LOCK_TTL,
      'NX'
    );
    if (acquired === 'OK') {
      this.startRenewal(instanceId);
      return true;
    }
    return false;
  }

  private startRenewal(instanceId: string): void {
    if (this.renewalInterval) clearInterval(this.renewalInterval);
    this.renewalInterval = setInterval(async () => {
      try {
        await this.redis.set(this.key, instanceId, 'EX', LOCK_TTL, 'XX');
      } catch {
        // Logged by caller
      }
    }, (LOCK_TTL / 2) * 1000);
  }

  async release(instanceId: string): Promise<void> {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = null;
    }
    // Lua script: only delete if we still own the lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, this.key, instanceId);
  }
}
