import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { PendingAckData } from "./messaging-types";

export interface IPendingAckOps {
	recoverPendingAcks(
		ownInstanceId: InstanceId,
		maxAgeMs?: number
	): Promise<number>;
	addPendingAck(
		instanceId: InstanceId,
		messageId: string,
		data: PendingAckData
	): Promise<void>;
	removePendingAck(instanceId: InstanceId, messageId: string): Promise<void>;
	getPendingAcks(
		instanceId: InstanceId
	): Promise<Record<string, PendingAckData>>;
}
