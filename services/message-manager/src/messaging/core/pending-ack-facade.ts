import type { PendingAckData } from "./messaging-types";
import { PendingAckStore } from "./pending-ack-store";

export class PendingAckFacade {
	private readonly _pendingAckStore: PendingAckStore;

	constructor(prefix: string) {
		this._pendingAckStore = new PendingAckStore(prefix);
	}

	recoverStale(ownInstanceId: string, maxAgeMs = 120_000): Promise<number> {
		return this._pendingAckStore.recoverStale(ownInstanceId, maxAgeMs);
	}

	async add(
		instanceId: string,
		messageId: string,
		data: PendingAckData
	): Promise<void> {
		await this._pendingAckStore.add(instanceId, messageId, data);
	}

	async remove(instanceId: string, messageId: string): Promise<void> {
		await this._pendingAckStore.remove(instanceId, messageId);
	}

	getAll(instanceId: string): Promise<Record<string, PendingAckData>> {
		return this._pendingAckStore.getAll(instanceId);
	}
}
