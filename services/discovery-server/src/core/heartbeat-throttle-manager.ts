import type { ServiceInstanceName } from "@trading-model/common/config/services.types";

export class HeartbeatThrottleManager {
	private readonly _heartbeatInvalidationThrottleMs = 5000;
	private _lastHeartbeatInvalidation = new Map<string, number>();

	async onHeartbeatUpdate(
		serviceName: ServiceInstanceName,
		publish: (name: ServiceInstanceName) => Promise<void>
	): Promise<void> {
		const now = Date.now();
		const last = this._lastHeartbeatInvalidation.get(serviceName) ?? 0;
		if (now - last >= this._heartbeatInvalidationThrottleMs) {
			this._lastHeartbeatInvalidation.set(serviceName, now);
			await publish(serviceName);
		}
	}
}
