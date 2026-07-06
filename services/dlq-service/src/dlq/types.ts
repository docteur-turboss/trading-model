import type { Span } from "@opentelemetry/api";
import type { HttpClient } from "@trading-model/common/config/http-client";

export interface BatchContext {
	batchId: string;
	instanceId: string;
}

export interface DlqEntryRef {
	id: string;
	message: unknown;
}

export interface DlqError {
	id: string;
	error: string;
}

export interface BatchReplayContext extends BatchContext {
	client: HttpClient;
	messageManagerUrl: string;
}

export interface ReplayBatchOptions extends BatchContext {
	entries: DlqEntryRef[];
	messageManagerUrl: string;
}

export interface ClaimAndReplayOptions extends Partial<BatchContext> {
	messageManagerUrl: string;
	limit: number;
	topic: string | undefined;
	span: Span;
}

export interface BatchResults {
	successCount: { value: number };
	errors: DlqError[];
}
