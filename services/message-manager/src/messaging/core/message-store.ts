import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { MessageRoutingFacade } from "./message-routing-facade";
import { MessageStreamWriter } from "./message-stream-writer";
import type { AckRef, MessageQuery, StreamGroupRef } from "./messaging-types";
import { WalFlusherService } from "./wal-flusher-service";

export class MessageStore {
	private readonly _memoryWalBuffer: MemoryWalBuffer;
	private readonly _routingFacade: MessageRoutingFacade;
	private readonly _walFlusher: WalFlusherService;
	private readonly _streamWriter: MessageStreamWriter;

	constructor() {
		this._routingFacade = new MessageRoutingFacade(ENV.REDIS_PREFIX);
		this._memoryWalBuffer = new MemoryWalBuffer(ENV.REDIS_PREFIX);
		this._walFlusher = new WalFlusherService(
			ENV.REDIS_PREFIX,
			this._memoryWalBuffer
		);
		this._streamWriter = new MessageStreamWriter(
			ENV.REDIS_PREFIX,
			this._walFlusher
		);
		this._walFlusher.start();
		this._memoryWalBuffer.startFlusher();
	}

	async recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		return this._routingFacade.recoverPendingAcks(ownInstanceId, maxAgeMs);
	}

	async claimPendingMessages(
		groupName: string,
		consumerId: string,
		minIdleMs = 60_000,
		count = 100
	): Promise<number> {
		return this._routingFacade.claimPendingMessages(
			groupName,
			consumerId,
			minIdleMs,
			count
		);
	}

	async ensureConsumerGroup(ref: StreamGroupRef): Promise<void> {
		await this._routingFacade.ensureConsumerGroup(ref);
	}

	async readFromGroup(
		params: import("./stream-group-manager").ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._routingFacade.readFromGroup(params);
	}

	async ackMessage(ref: AckRef): Promise<void> {
		await this._routingFacade.ackMessage(ref);
	}

	async getPendingCount(ref: StreamGroupRef): Promise<number> {
		return this._routingFacade.getPendingCount(ref);
	}

	async getMessagesAfter(query: MessageQuery): Promise<Message[]> {
		return this._routingFacade.getMessagesAfter(query);
	}

	async getMessagesBetween(
		params: import("./stream-group-manager").GetMessagesBetweenParams
	): Promise<Message[]> {
		return this._routingFacade.getMessagesBetween(params);
	}

	async addPendingAck(
		instanceId: string,
		messageId: string,
		data: {
			topic: string;
			subscriberUrl: string;
			message: Message;
		}
	): Promise<void> {
		await this._routingFacade.addPendingAck(instanceId, messageId, data);
	}

	async removePendingAck(instanceId: string, messageId: string): Promise<void> {
		await this._routingFacade.removePendingAck(instanceId, messageId);
	}

	async getPendingAcks(instanceId: string): Promise<
		Record<
			string,
			{
				topic: string;
				subscriberUrl: string;
				message: Message;
			}
		>
	> {
		return this._routingFacade.getPendingAcks(instanceId);
	}

	async getStreamLag(ref: StreamGroupRef): Promise<number> {
		return this._routingFacade.getStreamLag(ref);
	}

	async tryDeduplicate(
		deduplicationId: string,
		ttlS: number
	): Promise<boolean> {
		return this._routingFacade.tryDeduplicate(deduplicationId, ttlS);
	}

	async store(topic: string, message: Message): Promise<string> {
		return this._streamWriter.store(topic, message);
	}

	async drainAndStop(timeoutMs = 10_000): Promise<void> {
		await this._walFlusher.drainAndStop(timeoutMs);
	}

	stop(): void {
		this._walFlusher.stop();
		this._memoryWalBuffer.stopFlusher();
	}

	async drainWalOnStartup(): Promise<void> {
		await this._walFlusher.drainOnStartup();
	}

	async drainWal(timeoutMs = 10_000): Promise<void> {
		await this._walFlusher.drain(timeoutMs);
	}
}

export const messageStore = new MessageStore();
