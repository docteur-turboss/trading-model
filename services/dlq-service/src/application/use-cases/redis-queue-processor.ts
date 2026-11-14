import type { URLString } from "@trading-model/primitives/primitives";
import type { QueuePopPort } from "../../domain/ports/dlq.port";
import type {
	ClaimReleasePort,
	MessageManagerLocatorPort,
} from "../../domain/ports/replay.port";

export interface RedisQueueProcessorDeps {
	queue: QueuePopPort;
	messageManager: MessageManagerLocatorPort;
	claimRelease: Pick<ClaimReleasePort, "releaseStaleClaims">;
	orchestrator: {
		claimAndReplay(
			entryIds: string[],
			messageManagerUrl: URLString
		): Promise<void>;
	};
}

/** One pass of the Redis worker: pop the queued ids, claim them, replay them. */
export function createRedisQueueProcessor(
	deps: RedisQueueProcessorDeps
): () => Promise<void> {
	return async () => {
		if (deps.queue.shouldSkip()) {
			return;
		}

		const messageManagerUrl = await deps.messageManager.resolve();
		if (!messageManagerUrl) {
			return;
		}

		await deps.claimRelease.releaseStaleClaims();

		const entryIds = await deps.queue.popEntries();
		if (entryIds.length === 0) {
			return;
		}

		await deps.orchestrator.claimAndReplay(entryIds, messageManagerUrl);
	};
}
