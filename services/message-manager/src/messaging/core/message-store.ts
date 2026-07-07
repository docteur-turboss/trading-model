import { ENV } from "../../config/env";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { MessageRoutingFacade } from "./message-routing-facade";
import { MessageStreamWriter } from "./message-stream-writer";
import type { Message } from "@trading-model/common/contracts/message.types";
import type { AckRef, ClaimParams, MessageQuery, PendingAckData, StreamGroupRef } from "./messaging-types";
import { WalFlusherService } from "./wal-flusher-service";
import type { IMessageRouting } from "./message-routing-interface";
import type { IMessageStorage } from "./message-storage-interface";
import type { IWalLifecycle } from "./wal-lifecycle-interface";

export class MessageStore implements IMessageRouting, IMessageStorage, IWalLifecycle {
	private readonly _memoryWalBuffer: MemoryWalBuffer;
	private readonly _routingFacade: MessageRoutingFacade;
	private readonly _walFlusher: WalFlusherService;
	private readonly _streamWriter: MessageStreamWriter;

	constructor() {
		this._routingFacade = new MessageRoutingFacade(ENV.REDIS_PREFIX);
		this._memoryWalBuffer = new MemoryWalBuffer(ENV.REDIS_PREFIX);
		this._walFlusher = new WalFlusherService(ENV.REDIS_PREFIX, this._memoryWalBuffer);
		this._streamWriter = new MessageStreamWriter(ENV.REDIS_PREFIX, this._walFlusher);
		this._walFlusher.start();
		this._memoryWalBuffer.startFlusher();
	}

	get routing(): MessageRoutingFacade {
		return this._routingFacade;
	}

	get storage(): MessageStreamWriter {
		return this._streamWriter;
	}

	get wal(): WalFlusherService {
		return this._walFlusher;
	}

	async recoverPendingAcks(ownInstanceId: string, maxAgeMs = 120_000): Promise<number> { return this._routingFacade.recoverPendingAcks(ownInstanceId, maxAgeMs); }
	async claimPendingMessages(params: ClaimParams): Promise<number> { return this._routingFacade.claimPendingMessages(params); }
	async ensureConsumerGroup(ref: StreamGroupRef): Promise<void> { return this._routingFacade.ensureConsumerGroup(ref); }
	async readFromGroup(params: import("./stream-group-manager").ReadFromGroupParams): Promise<Array<{ id: string; data: string }>> { return this._routingFacade.readFromGroup(params); }
	async ackMessage(ref: AckRef): Promise<void> { return this._routingFacade.ackMessage(ref); }
	async getPendingCount(ref: StreamGroupRef): Promise<number> { return this._routingFacade.getPendingCount(ref); }
	async getMessagesAfter(query: MessageQuery): Promise<Message[]> { return this._routingFacade.getMessagesAfter(query); }
	async getMessagesBetween(params: import("./stream-group-manager").GetMessagesBetweenParams): Promise<Message[]> { return this._routingFacade.getMessagesBetween(params); }
	async addPendingAck(instanceId: string, messageId: string, data: PendingAckData): Promise<void> { return this._routingFacade.addPendingAck(instanceId, messageId, data); }
	async removePendingAck(instanceId: string, messageId: string): Promise<void> { return this._routingFacade.removePendingAck(instanceId, messageId); }
	async getPendingAcks(instanceId: string): Promise<Record<string, PendingAckData>> { return this._routingFacade.getPendingAcks(instanceId); }
	async getStreamLag(ref: StreamGroupRef): Promise<number> { return this._routingFacade.getStreamLag(ref); }
	async tryDeduplicate(deduplicationId: string, ttlS: number): Promise<boolean> { return this._routingFacade.tryDeduplicate(deduplicationId, ttlS); }
	async store(topic: string, message: Message): Promise<string> { return this._streamWriter.store(topic, message); }
	async drainAndStop(timeoutMs = 10_000): Promise<void> { await this._walFlusher.drainAndStop(timeoutMs); }
	stop(): void { this._walFlusher.stop(); this._memoryWalBuffer.stopFlusher(); }
	async drainWalOnStartup(): Promise<void> { await this._walFlusher.drainOnStartup(); }
	async drainWal(timeoutMs = 10_000): Promise<void> { await this._walFlusher.drain(timeoutMs); }
}
