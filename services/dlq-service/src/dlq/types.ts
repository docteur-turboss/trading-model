import type { Span } from "@opentelemetry/api";
import type { HttpClient } from "@trading-model/common/config/http-client";
import type { InstanceId, MessageId, Topic, URLString } from "@trading-model/common/domain/primitives";

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
	client: HttpClient;
	messageManagerUrl: URLString;
}

export interface ReplayBatchOptions extends BatchContext {
	entries: DlqEntryRef[];
	messageManagerUrl: URLString;
}

export interface ClaimAndReplayOptions extends Pick<BatchContext, "batchId"> {
	messageManagerUrl: URLString;
	limit: number;
	topic: Topic | undefined;
	span: Span;
}

export interface BatchResults {
	successCount: { value: number };
	errors: DlqError[];
}
