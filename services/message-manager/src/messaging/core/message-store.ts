import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { MessageRoutingFacade } from "./message-routing-facade";
import { MessageStreamWriter } from "./message-stream-writer";
import { WalFlusherService } from "./wal-flusher-service";

export class MessageStore extends MessageRoutingFacade {
	private readonly _memoryWalBuffer: MemoryWalBuffer;
	private readonly _walFlusher: WalFlusherService;
	private readonly _streamWriter: MessageStreamWriter;

	constructor() {
		super(ENV.REDIS_PREFIX);
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
