import type { InstanceId } from "@trading-model/common/domain/primitives";

export class ConnectionTracker {
	private readonly _connections = new Map<InstanceId, number>();

	acquire(instanceId: InstanceId): void {
		this._connections.set(
			instanceId,
			(this._connections.get(instanceId) ?? 0) + 1
		);
	}

	release(instanceId: InstanceId): void {
		const count = this._connections.get(instanceId);
		if (count !== undefined) {
			if (count <= 1) {
				this._connections.delete(instanceId);
			} else {
				this._connections.set(instanceId, count - 1);
			}
		}
	}

	getConnectionCount(instanceId: InstanceId): number {
		return this._connections.get(instanceId) ?? 0;
	}
}
