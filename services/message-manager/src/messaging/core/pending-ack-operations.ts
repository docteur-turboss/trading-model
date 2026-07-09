import type { PendingAckData } from "./messaging-types";
import { PendingAckFacade } from "./pending-ack-facade";

export class PendingAckOperations {
	private readonly _pendingAck: PendingAckFacade;

	constructor(prefix: string) {
		this._pendingAck = new PendingAckFacade(prefix);
	}

	recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		return this._pendingAck.recoverStale(ownInstanceId, maxAgeMs);
	}

	async addPendingAck(
		instanceId: string,
		messageId: string,
		data: PendingAckData
	): Promise<void> {
		await this._pendingAck.add(instanceId, messageId, data);
	}

	async removePendingAck(instanceId: string, messageId: string): Promise<void> {
		await this._pendingAck.remove(instanceId, messageId);
	}

	getPendingAcks(instanceId: string): Promise<Record<string, PendingAckData>> {
		return this._pendingAck.getAll(instanceId);
	}
}
