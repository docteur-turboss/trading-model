export class BackPressure {
  private queueDepth = 0;
  private readonly workerLoads: Map<string, number> = new Map();

  constructor(
    private readonly maxQueueDepth: number,
    private readonly maxWorkerLoadRatio: number
  ) {}

  updateQueueDepth(depth: number): void {
    this.queueDepth = depth;
  }

  updateWorkerLoad(workerId: string, load: number): void {
    this.workerLoads.set(workerId, load);
  }

  removeWorker(workerId: string): void {
    this.workerLoads.delete(workerId);
  }

  canAccept(): boolean {
    if (this.queueDepth >= this.maxQueueDepth) {
      return false;
    }
    if (this.workerLoads.size === 0) {
      return true;
    }
    for (const load of this.workerLoads.values()) {
      if (load < this.maxWorkerLoadRatio) {
        return true;
      }
    }
    return false;
  }

  retryAfterSeconds(): number {
    return Math.ceil(this.queueDepth / 100) * 5;
  }
}
