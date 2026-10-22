import type { Span } from "@opentelemetry/api";
import type {
	InstanceId,
	Limit,
	MessageId,
	Topic,
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

export interface ClaimAndReplayOptions extends Pick<BatchContext, "batchId"> {
	messageManagerUrl: URLString;
	limit: Limit;
	topic: Topic | undefined;
	span: Span;
}

export interface BatchResults {
	success: number;
	errors: DlqError[];
}
