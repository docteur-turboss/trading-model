import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { PositiveInt } from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import type { HeartbeatSenderPort } from "@trading-model/reliability/heartbeat-sender.port";
import type { ServiceClientDeps } from "./types";

const MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER = PositiveInt.of(3);
// 401: token unknown; 404: lease expired and removed ("Instance not found").
const LEASE_LOST_STATUSES: unknown[] = [401, 404];

/** True when the error, or one of its causes, is an HTTP 401 or 404 response. */
function _isLeaseLost(err: unknown): boolean {
	let current: unknown = err;
	for (let depth = 0; current && depth < 5; depth++) {
		if (
			LEASE_LOST_STATUSES.includes(
				(current as { statusCode?: unknown }).statusCode
			)
		) {
			return true;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

/** Sends the heartbeats of the registered instance; re-registers after a 401, a 404 or repeated failures. */
export class HeartbeatManager implements HeartbeatSenderPort {
	private _consecutiveHeartbeatFailures = 0;

	constructor(private readonly _deps: ServiceClientDeps) {}

	async sendHeartbeat(_identity: ServiceIdentity): Promise<void> {
		try {
			await this._deps.addressManagerClient.refreshTTL();
			this._deps.onSuccess?.();
			this._consecutiveHeartbeatFailures = 0;
		} catch (err) {
			await this._handleError(err);
		}
	}

	private async _handleError(err: unknown): Promise<void> {
		this._deps.onFailure?.();
		this._consecutiveHeartbeatFailures++;
		getLogger().error("Heartbeat failed", {
			consecutiveFailures: this._consecutiveHeartbeatFailures,
			error: normalizeError(err),
		});
		// 401: discovery no longer knows our token (it restarted and lost its
		// in-memory tokens). 404: it removed our lease (30 s without a heartbeat,
		// e.g. while Redis or discovery restarted). Retrying the heartbeat cannot
		// succeed and the gateway answers 404 for this service meanwhile: re-register now.
		if (
			_isLeaseLost(err) ||
			this._consecutiveHeartbeatFailures >=
				MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER
		) {
			this._consecutiveHeartbeatFailures = 0;
			getLogger().warn("Too many heartbeat failures — forcing re-registration");
			await this._tryReRegistration();
		}
		if (this._deps.addressManagerClient.hasIpChanged()) {
			getLogger().warn("Local IP changed, re-registering service");
			await this._tryReRegistration();
		}
	}

	private async _tryReRegistration(): Promise<void> {
		try {
			const res = await this._deps.addressManagerClient.registerService();
			if (res?.token) {
				this._deps.tokenManager.setToken(res.token);
			}
		} catch (err) {
			getLogger().error("Re-registration failed", {
				error: normalizeError(err),
			});
		}
	}
}
