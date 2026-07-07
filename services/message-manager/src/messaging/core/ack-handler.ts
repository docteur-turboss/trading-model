import { logger } from "../../config/logger";

export class AckHandler {
	async handleAck(messageId: string, instanceId: string): Promise<void> {
		logger.info("Message acknowledged", {
			context: { messageId, instanceId },
		});
	}

	async handleNack(messageId: string, instanceId: string): Promise<void> {
		logger.warn("Message negatively acknowledged", {
			context: { messageId, instanceId },
		});
	}
}
