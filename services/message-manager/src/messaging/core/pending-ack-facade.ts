import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import type { PendingAckData } from "./messaging-types";
import { PendingAckStore } from "./pending-ack-store";

export class PendingAckFacade {
	private readonly _pendingAckStore: PendingAckStore;

	constructor(keys: RedisKeyBuilder) {
		this._pendingAckStore = new PendingAckStore(keys);
	}

	recoverStale(ownInstanceId: InstanceId, maxAgeMs = 120_000): Promise<number> {
		return this._pendingAckStore.recoverStale(ownInstanceId, maxAgeMs);
	}

	async add(
		instanceId: InstanceId,
		messageId: string,
		data: PendingAckData
	): Promise<void> {
		await this._pendingAckStore.add(instanceId, messageId, data);
	}

	async remove(instanceId: InstanceId, messageId: string): Promise<void> {
		await this._pendingAckStore.remove(instanceId, messageId);
	}

	getAll(instanceId: InstanceId): Promise<Record<string, PendingAckData>> {
		return this._pendingAckStore.getAll(instanceId);
	}
}
