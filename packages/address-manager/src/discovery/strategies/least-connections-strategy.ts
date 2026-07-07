import type { InstanceId } from "@trading-model/common/domain/primitives";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { ServiceInstance } from "../../client/type";
import type { ConnectionCountingStrategy } from "../load-balancing-strategy";

export class LeastConnectionsStrategy implements ConnectionCountingStrategy {
	private readonly _connections = new Map<InstanceId, number>();
	private readonly _sweepHandle = new TimerHandle();

	constructor() {
		this._sweepHandle.startInterval(() => this._sweepStaleEntries(), 60_000);
		this._sweepHandle.unref();
	}

	dispose(): void {
		this._sweepHandle.stop();
	}

	private _sweepStaleEntries(): void {
		for (const [id, count] of this._connections) {
			if (count <= 0) {
				this._connections.delete(id);
			}
		}
	}

	select(instances: ServiceInstance[]): ServiceInstance {
		let min = Number.POSITIVE_INFINITY;
		let selected = instances[0];

		for (const inst of instances) {
			const count = this._connections.get(inst.instanceId) ?? 0;
			if (count < min) {
				min = count;
				selected = inst;
			}
		}

		return selected;
	}

	acquire(instanceId: InstanceId): void {
		this._connections.set(
			instanceId,
			(this._connections.get(instanceId) ?? 0) + 1
		);
	}

	release(instanceId: InstanceId): void {
		const current = this._connections.get(instanceId) ?? 0;
		if (current <= 1) {
			this._connections.delete(instanceId);
		} else {
			this._connections.set(instanceId, current - 1);
		}
	}
}
