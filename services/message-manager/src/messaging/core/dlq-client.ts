import type { HttpClient } from "@trading-model/common/config/http-client";
import { ENV } from "../../config/env";
import { DlqDeleteHandler } from "./dlq-delete-handler";
import { DlqReplayHandler } from "./dlq-replay-handler";
import type { DlqEntry } from "./dlq-repository";
import { DlqSendHandler } from "./dlq-send-handler";

export interface DlqSendOptions {
	attempt?: number;
	maxRetries?: number;
}

export interface IDlqServiceClient {
	readonly isEnabled: boolean;
	send(entry: DlqEntry, options?: DlqSendOptions): Promise<void>;
	replay(topic?: string, limit?: number): Promise<DlqEntry[]>;
	delete(entryIds: string[]): Promise<void>;
}

export class DlqServiceClient implements IDlqServiceClient {
	private readonly _sendHandler: DlqSendHandler;
	private readonly _replayHandler: DlqReplayHandler;
	private readonly _deleteHandler: DlqDeleteHandler;
	private readonly _serviceUrl: string;

	constructor(httpClient: HttpClient) {
		this._serviceUrl = ENV.DLQ_SERVICE_URL || "";
		this._sendHandler = new DlqSendHandler(httpClient, this._serviceUrl);
		this._replayHandler = new DlqReplayHandler(httpClient, this._serviceUrl);
		this._deleteHandler = new DlqDeleteHandler(httpClient, this._serviceUrl);
	}

	get isEnabled(): boolean {
		return Boolean(this._serviceUrl);
	}

	async send(entry: DlqEntry, options?: DlqSendOptions): Promise<void> {
		if (!this.isEnabled) {
			return;
		}
		const attempt = options?.attempt ?? 1;
		const maxRetries = options?.maxRetries ?? 3;
		try {
			await this._sendHandler.doSend(entry);
		} catch (err) {
			return this._sendHandler.handleSendError(
				entry,
				err as Error,
				attempt,
				maxRetries
			);
		}
	}

	replay(topic?: string, limit = 100): Promise<DlqEntry[]> {
		if (!this.isEnabled) {
			return Promise.resolve([]);
		}
		return this._replayHandler.replay(topic, limit);
	}

	async delete(entryIds: string[]): Promise<void> {
		if (!this.isEnabled) {
			return;
		}
		await this._deleteHandler.delete(entryIds);
	}
}
