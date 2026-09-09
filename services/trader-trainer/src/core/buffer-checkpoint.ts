import { join } from "node:path";
import { logger } from "@trading-model/common/config/logger";
import type { FilePath } from "@trading-model/common/domain/primitives";

const BUFFER_STATE_FILENAME = "market_data_buffer.json";

export function bufferStatePath(checkpointDir: FilePath): string {
	return join(checkpointDir, BUFFER_STATE_FILENAME);
}

export function logBufferCheckpointError(
	action: "load" | "save",
	err: unknown
): void {
	logger.error(`Failed to ${action} market data buffer checkpoint`, {
		context: {
			error: err instanceof Error ? err.message : String(err),
		},
	});
}
