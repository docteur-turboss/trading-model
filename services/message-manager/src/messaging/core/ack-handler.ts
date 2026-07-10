import type { InstanceId } from "@trading-model/common/domain/primitives";
import { logger } from "../../config/logger";

export class AckHandler {
	handleAck(messageId: string, instanceId: InstanceId): void {
		logger.info("Message acknowledged", {
			context: { messageId, instanceId },
		});
	}

	handleNack(messageId: string, instanceId: InstanceId): void {
		logger.warn("Message negatively acknowledged", {
			context: { messageId, instanceId },
		});
	}
}
