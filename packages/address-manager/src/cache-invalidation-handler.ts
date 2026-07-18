import { logger } from "@trading-model/common/config/logger";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DiscoveryWsMessageType } from "@trading-model/validation/contracts/discovery-ws-message.types";
import type { WsMessage } from "./client/websocket-client";
import type { IServiceCache } from "./discovery/service-cache.interface";

export function handleCacheInvalidation(
	message: WsMessage,
	serviceCache: IServiceCache
): void {
	if (message.type !== DiscoveryWsMessageType.CacheInvalidate) {
		return;
	}
	const serviceName = message.payload?.serviceName as string | undefined;
	if (!serviceName) {
		return;
	}
	serviceCache.delete(toServiceId(serviceName)).catch((err) => {
		logger.warn("WebSocket cache invalidation failed", {
			serviceName,
			error: normalizeError(err),
		});
	});
}
