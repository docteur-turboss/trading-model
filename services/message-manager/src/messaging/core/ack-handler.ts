import { logger } from "../../config/logger";

export class AckHandler {
	handleAck(messageId: string, instanceId: string): void {
		logger.info("Message acknowledged", {
			context: { messageId, instanceId },
		});
	}

	handleNack(messageId: string, instanceId: string): void {
		logger.warn("Message negatively acknowledged", {
			context: { messageId, instanceId },
		});
	}
}
