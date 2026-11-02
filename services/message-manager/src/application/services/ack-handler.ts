import { getLogger } from "@trading-model/contracts/logger-registry";
import type { InstanceId } from "@trading-model/primitives/primitives";

export function handleAck(messageId: string, instanceId: InstanceId): void {
	getLogger().info("Message acknowledged", {
		context: { messageId, instanceId },
	});
}

export function handleNack(messageId: string, instanceId: InstanceId): void {
	getLogger().warn("Message negatively acknowledged", {
		context: { messageId, instanceId },
	});
}
