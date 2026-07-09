import { logger } from "@trading-model/common/config/logger";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { WsMessage } from "./client/websocket-client";
import type { IServiceCache } from "./discovery/service-cache.interface";

export class CacheInvalidationHandler {
	handle(message: WsMessage, serviceCache: IServiceCache): void {
		if (message.type !== "cache.invalidate") {
			return;
		}
		const serviceName = message.payload?.serviceName as string | undefined;
		if (!serviceName) {
			return;
		}
		serviceCache.invalidate(toServiceId(serviceName)).catch((err) => {
			logger.warn("WebSocket cache invalidation failed", {
				serviceName,
				error: normalizeError(err),
			});
		});
	}
}
