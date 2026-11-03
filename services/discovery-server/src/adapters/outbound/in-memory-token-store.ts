import type {
	AuthToken,
	InstanceId,
} from "@trading-model/primitives/primitives";
import type { InstanceTokenStorePort } from "../../domain/ports/instance-token-store.port";

/** Single-replica token store (no Redis configured). */
export class InMemoryTokenStore implements InstanceTokenStorePort {
	private readonly _tokens = new Map<InstanceId, AuthToken>();

	get(instanceId: InstanceId): Promise<AuthToken | undefined> {
		return Promise.resolve(this._tokens.get(instanceId));
	}

	set(instanceId: InstanceId, token: AuthToken): Promise<void> {
		this._tokens.set(instanceId, token);
		return Promise.resolve();
	}

	delete(instanceId: InstanceId): Promise<void> {
		this._tokens.delete(instanceId);
		return Promise.resolve();
	}
}
