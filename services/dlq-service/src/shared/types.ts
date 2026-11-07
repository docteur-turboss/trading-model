import type {
	InstanceId,
	MessageId,
	URLString,
} from "@trading-model/primitives/primitives";

export interface BatchContext {
	batchId: string;
	instanceId: InstanceId;
}

export interface DlqEntryRef {
	id: MessageId;
	message: unknown;
}

export interface DlqError {
	id: MessageId;
	error: string;
}

export interface BatchReplayContext extends BatchContext {
	messageManagerUrl: URLString;
}

export interface ReplayBatchOptions extends BatchContext {
	entries: DlqEntryRef[];
	messageManagerUrl: URLString;
}

export interface BatchResults {
	success: number;
	errors: DlqError[];
}
