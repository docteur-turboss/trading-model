import type {
	InstanceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { Message } from "@trading-model/validation/contracts/message.types";
import { ENV } from "../../config/env";
import { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { MessageRoutingFacade } from "./message-routing-facade";
import type { IMessageRouting } from "./message-routing-interface";
import type { IMessageStorage } from "./message-storage-interface";
import { MessageStreamWriter } from "./message-stream-writer";
import type {
	AckRef,
	ClaimParams,
	DedupConfig,
	MessageQuery,
	PendingAckData,
	StreamGroupRef,
} from "./messaging-types";
import { WalFlusherService } from "./wal-flusher-service";
import type { IWalLifecycle } from "./wal-lifecycle-interface";

export class MessageStore
	implements IMessageRouting, IMessageStorage, IWalLifecycle
{
	private readonly _keys: RedisKeyBuilder;
	private readonly _memoryWalBuffer: MemoryWalBuffer;
	private readonly _routingFacade: MessageRoutingFacade;
	private readonly _walFlusher: WalFlusherService;
	private readonly _streamWriter: MessageStreamWriter;

	constructor() {
		this._keys = new RedisKeyBuilder(ENV.REDIS_PREFIX);
		this._routingFacade = new MessageRoutingFacade(this._keys);
		this._memoryWalBuffer = new MemoryWalBuffer(this._keys);
		this._walFlusher = new WalFlusherService(this._keys, this._memoryWalBuffer);
		this._streamWriter = new MessageStreamWriter(this._keys, this._walFlusher);
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

	recoverPendingAcks(
		ownInstanceId: string,
		maxAgeMs = 120_000
	): Promise<number> {
		return this._routingFacade.recoverPendingAcks(ownInstanceId, maxAgeMs);
	}
	claimPendingMessages(params: ClaimParams): Promise<number> {
		return this._routingFacade.claimPendingMessages(params);
	}
	ensureConsumerGroup(ref: StreamGroupRef): Promise<void> {
		return this._routingFacade.ensureConsumerGroup(ref);
	}
	readFromGroup(
		params: import("./stream-group-manager").ReadFromGroupParams
	): Promise<Array<{ id: string; data: string }>> {
		return this._routingFacade.readFromGroup(params);
	}
	ackMessage(ref: AckRef): Promise<void> {
		return this._routingFacade.ackMessage(ref);
	}
	getPendingCount(ref: StreamGroupRef): Promise<number> {
		return this._routingFacade.getPendingCount(ref);
	}
	getMessagesAfter(query: MessageQuery): Promise<Message[]> {
		return this._routingFacade.getMessagesAfter(query);
	}
	getMessagesBetween(
		params: import("./stream-group-manager").GetMessagesBetweenParams
	): Promise<Message[]> {
		return this._routingFacade.getMessagesBetween(params);
	}
	addPendingAck(
		instanceId: InstanceId,
		messageId: string,
		data: PendingAckData
	): Promise<void> {
		return this._routingFacade.addPendingAck(instanceId, messageId, data);
	}
	removePendingAck(instanceId: InstanceId, messageId: string): Promise<void> {
		return this._routingFacade.removePendingAck(instanceId, messageId);
	}
	getPendingAcks(
		instanceId: InstanceId
	): Promise<Record<string, PendingAckData>> {
		return this._routingFacade.getPendingAcks(instanceId);
	}
	getStreamLag(ref: StreamGroupRef): Promise<number> {
		return this._routingFacade.getStreamLag(ref);
	}
	tryDeduplicate(params: DedupConfig): Promise<boolean> {
		return this._routingFacade.tryDeduplicate(params);
	}
	store(topic: Topic, message: Message): Promise<string> {
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
