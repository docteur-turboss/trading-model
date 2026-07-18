import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	DurationMs,
	type UnixTimestamp,
} from "@trading-model/common/domain/primitives";

export class HeartbeatThrottleManager {
	private readonly _heartbeatInvalidationThrottleMs: DurationMs =
		DurationMs.of(5000);
	private _lastHeartbeatInvalidation = new Map<
		ServiceInstanceName,
		UnixTimestamp
	>();

	async onHeartbeatUpdate(
		serviceName: ServiceInstanceName,
		publish: (name: ServiceInstanceName) => Promise<void>
	): Promise<void> {
		const now = Date.now();
		const last = this._lastHeartbeatInvalidation.get(serviceName) ?? 0;
		if (now - last >= this._heartbeatInvalidationThrottleMs) {
			this._lastHeartbeatInvalidation.set(serviceName, now as UnixTimestamp);
			await publish(serviceName);
		}
	}
}
