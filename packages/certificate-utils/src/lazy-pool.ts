import { WorkerPool } from "./worker-pool";

let pool: WorkerPool | undefined;

export function getPool(size?: number): WorkerPool {
	if (!pool) {
		pool = new WorkerPool(
			size ? { size, maxQueueSize: 1000 } : { maxQueueSize: 1000 }
		);
	}
	return pool;
}

export function warmupPool(size?: number): void {
	getPool(size).start();
}
