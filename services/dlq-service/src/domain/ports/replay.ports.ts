import type {
	InstanceId,
	Limit,
	Topic,
	URLString,
} from "@trading-model/primitives/primitives";
import type { BatchContext, DlqEntryRef } from "../../shared/types";

/** A DLQ entry claimed by this instance for replay. */
export interface ClaimedEntry {
	id: string;
	message: unknown;
}

export interface ClaimEntriesOptions {
	limit: Limit;
	batchId: string;
	instanceId: InstanceId;
	topic?: Topic;
}

/** Atomically claims queuable entries (MongoDB claim manager). */
export interface EntryClaimPort {
	claimEntriesForRetry(options: ClaimEntriesOptions): Promise<ClaimedEntry[]>;
	claimEntriesByIds(ids: string[], ctx: BatchContext): Promise<ClaimedEntry[]>;
}

/** Releases claims held by crashed, stopped or stalled replays. */
export interface ClaimReleasePort {
	releaseStaleClaims(staleThresholdMs?: number): Promise<number>;
	releaseClaimsByInstance(instanceId: InstanceId): Promise<number>;
	releaseAllActiveClaims(): Promise<number>;
}

/** Retry bookkeeping: moves entries past the max retry count to ABANDONED. */
export interface RetryLedgerPort {
	abandonExhaustedEntries(): Promise<number>;
}

/** Ids of the entries eligible for replay. */
export interface QueuableEntriesPort {
	listQueuable(): Promise<string[]>;
}

/** Fast replay queue (Redis), optional: the service degrades without it. */
export interface ReplayQueuePort {
	push(entryId: string): Promise<boolean>;
	isAvailable(): boolean;
}

export interface DeliveryTarget extends BatchContext {
	messageManagerUrl: URLString;
}

/** Re-delivers one entry to the message-manager and records the outcome. */
export interface EntryDeliveryPort {
	deliver(entry: DlqEntryRef, target: DeliveryTarget): Promise<void>;
}

/** Resolves the message-manager base URL (env override or service discovery). */
export interface MessageManagerLocatorPort {
	resolve(): Promise<URLString | null>;
}

export interface ReplayAuditResult {
	batchId: string;
	topic?: Topic;
	success: number;
	failed: number;
}

/** Publishes the outcome of a replay batch to the audit trail. */
export interface ReplayAuditPort {
	notifyReplay(result: ReplayAuditResult): void;
}

/** Runtime settings, read on every access so configuration changes apply. */
export interface DlqReplaySettings {
	readonly instanceId: InstanceId;
	readonly autoRetryEnabled: boolean;
	readonly autoRetryLimit: Limit;
}
