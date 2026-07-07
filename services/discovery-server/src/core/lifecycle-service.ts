import type { ILifecycle } from "@trading-model/common/contracts/service-registry.types";
import type { RedisBackendLifecycle } from "./redis-backend-lifecycle";

export class LifecycleService implements ILifecycle {
	constructor(private readonly _lifecycle: RedisBackendLifecycle) {}

	start(): void {
		this._lifecycle.start();
	}

	stop(): void {
		this._lifecycle.stop();
	}

	async forceCleanup(): Promise<void> {
		await this._lifecycle.forceCleanup();
	}
}
