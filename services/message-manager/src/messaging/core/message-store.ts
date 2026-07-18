import { ENV } from "../../config/env";
import { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { ClaimExecutor } from "./claim-executor";
import { DeduplicationService } from "./deduplication-service";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { MessageStreamWriter } from "./message-stream-writer";
import { PendingAckStore } from "./pending-ack-store";
import { StreamGroupOperations } from "./stream-group-operations";
import { WalFlusherService } from "./wal-flusher-service";

export { ClaimExecutor } from "./claim-executor";
export { DeduplicationService } from "./deduplication-service";
export { MessageStreamWriter } from "./message-stream-writer";
export { PendingAckStore } from "./pending-ack-store";
export { StreamGroupOperations } from "./stream-group-operations";
export { WalFlusherService } from "./wal-flusher-service";

export class MessageStore {
	private readonly _keys: RedisKeyBuilder;
	private readonly _streamOps: StreamGroupOperations;
	private readonly _pendingAckOps: PendingAckStore;
	private readonly _claimOps: ClaimExecutor;
	private readonly _dedupOps: DeduplicationService;
	private readonly _memoryWalBuffer: MemoryWalBuffer;
	private readonly _walFlusher: WalFlusherService;
	private readonly _streamWriter: MessageStreamWriter;

	constructor() {
		this._keys = new RedisKeyBuilder(ENV.REDIS_PREFIX);
		this._streamOps = new StreamGroupOperations(this._keys);
		this._pendingAckOps = new PendingAckStore(this._keys);
		this._claimOps = new ClaimExecutor(this._keys);
		this._dedupOps = new DeduplicationService(this._keys);
		this._memoryWalBuffer = new MemoryWalBuffer(this._keys);
		this._walFlusher = new WalFlusherService(this._keys, this._memoryWalBuffer);
		this._streamWriter = new MessageStreamWriter(this._keys, this._walFlusher);
		this._walFlusher.start();
		this._memoryWalBuffer.startFlusher();
	}

	get streamOps(): StreamGroupOperations {
		return this._streamOps;
	}

	get pendingAckOps(): PendingAckStore {
		return this._pendingAckOps;
	}

	get claimOps(): ClaimExecutor {
		return this._claimOps;
	}

	get dedupOps(): DeduplicationService {
		return this._dedupOps;
	}

	get storage(): MessageStreamWriter {
		return this._streamWriter;
	}

	get wal(): WalFlusherService {
		return this._walFlusher;
	}

	stop(): void {
		this._walFlusher.stop();
		this._memoryWalBuffer.stopFlusher();
	}
}
